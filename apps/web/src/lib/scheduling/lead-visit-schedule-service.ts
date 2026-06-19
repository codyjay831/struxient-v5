import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
  Prisma,
  StaffRole,
  type Prisma as PrismaNamespace,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  assertCanCancelLeadVisit,
  assertCanCompleteLeadVisit,
  assertCanMutateLeadVisitSchedule,
  type LeadVisitAccessContext,
} from "./lead-visit-access";
import {
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  parseLeadVisitAccessSnapshot,
  parseLeadVisitSiteContactSnapshot,
  type LeadVisitAccessSnapshot,
  type LeadVisitSiteContactSnapshot,
} from "./lead-visit-schemas";

export type LeadVisitScheduleAction =
  | "confirm"
  | "cancel"
  | "reschedule"
  | "complete"
  | "no_show";

export type LeadVisitSourceSurface = "lead" | "calendar" | "workstation" | "sales";

export type LeadVisitServiceError = { error: string };

export type LeadVisitScheduleDetailsInput = {
  scheduledStartAt: Date;
  scheduledEndAt?: Date | null;
  estimatedDurationMinutes?: number | null;
  assignedUserId?: string | null;
  arrivalWindowStartAt?: Date | null;
  arrivalWindowEndAt?: Date | null;
  arrivalWindowLabel?: string | null;
  accessSnapshot?: LeadVisitAccessSnapshot | null;
  siteContactSnapshot?: LeadVisitSiteContactSnapshot | null;
  notes?: string | null;
};

const OUTCOME_NEXT_ACTION_MATRIX: Record<LeadVisitOutcome, readonly LeadVisitNextAction[]> = {
  [LeadVisitOutcome.QUOTE_READY]: [
    LeadVisitNextAction.START_QUOTE,
    LeadVisitNextAction.OPEN_OR_REVISE_QUOTE,
  ],
  [LeadVisitOutcome.QUOTE_NEEDS_REVISION]: [LeadVisitNextAction.OPEN_OR_REVISE_QUOTE],
  [LeadVisitOutcome.MISSING_INFORMATION]: [LeadVisitNextAction.COLLECT_MISSING_INFO],
  [LeadVisitOutcome.FOLLOW_UP_NEEDED]: [LeadVisitNextAction.FOLLOW_UP_CUSTOMER],
  [LeadVisitOutcome.CUSTOMER_NO_SHOW]: [
    LeadVisitNextAction.SCHEDULE_ANOTHER_VISIT,
    LeadVisitNextAction.FOLLOW_UP_CUSTOMER,
    LeadVisitNextAction.CLOSE_OR_DISQUALIFY,
  ],
  [LeadVisitOutcome.CONTRACTOR_MISSED]: [
    LeadVisitNextAction.SCHEDULE_ANOTHER_VISIT,
    LeadVisitNextAction.FOLLOW_UP_CUSTOMER,
  ],
  [LeadVisitOutcome.RESCHEDULE_NEEDED]: [LeadVisitNextAction.SCHEDULE_ANOTHER_VISIT],
  [LeadVisitOutcome.DISQUALIFIED]: [
    LeadVisitNextAction.CLOSE_OR_DISQUALIFY,
    LeadVisitNextAction.NONE_REQUIRED,
  ],
};

export function getAllowedNextActions(outcome: LeadVisitOutcome): readonly LeadVisitNextAction[] {
  return OUTCOME_NEXT_ACTION_MATRIX[outcome];
}

export function validateOutcomeNextActionPair(
  outcome: LeadVisitOutcome,
  nextAction: LeadVisitNextAction,
): LeadVisitServiceError | null {
  const allowed = OUTCOME_NEXT_ACTION_MATRIX[outcome];
  if (!allowed.includes(nextAction)) {
    return {
      error: `Next action ${nextAction} is not allowed for outcome ${outcome}.`,
    };
  }
  return null;
}

export function validateLeadVisitTransition(
  status: LeadVisitRequestStatus,
  action: LeadVisitScheduleAction,
): LeadVisitServiceError | null {
  if (action === "confirm" && status !== LeadVisitRequestStatus.PENDING) {
    return { error: "Only pending estimate visits can be scheduled." };
  }
  if (action === "reschedule" && status !== LeadVisitRequestStatus.CONFIRMED) {
    return { error: "Only scheduled estimate visits can be rescheduled." };
  }
  if (action === "cancel" && status === LeadVisitRequestStatus.CANCELED) {
    return { error: "This estimate visit is already canceled." };
  }
  if (
    action === "cancel" &&
    status !== LeadVisitRequestStatus.PENDING &&
    status !== LeadVisitRequestStatus.CONFIRMED
  ) {
    return { error: "This estimate visit cannot be canceled." };
  }
  if (action === "complete" && status !== LeadVisitRequestStatus.CONFIRMED) {
    return { error: "Only scheduled estimate visits can be completed." };
  }
  if (action === "no_show" && status !== LeadVisitRequestStatus.CONFIRMED) {
    return { error: "Only scheduled estimate visits can be marked no-show." };
  }
  return null;
}

function accessContextFromVisit(
  role: StaffRole,
  userId: string,
  assignedUserId: string | null | undefined,
): LeadVisitAccessContext {
  return { role, userId, assignedUserId };
}

function assertActionPermission(
  ctx: LeadVisitAccessContext,
  action: LeadVisitScheduleAction,
): LeadVisitServiceError | null {
  if (action === "cancel") {
    const gate = assertCanCancelLeadVisit(ctx);
    return gate.ok ? null : { error: gate.error };
  }
  if (action === "complete" || action === "no_show") {
    const gate = assertCanCompleteLeadVisit(ctx);
    return gate.ok ? null : { error: gate.error };
  }
  const gate = assertCanMutateLeadVisitSchedule(ctx);
  return gate.ok ? null : { error: gate.error };
}

export function getLeadVisitActionPermission(
  role: StaffRole,
  action: LeadVisitScheduleAction,
  assignedUserId?: string | null,
  userId?: string,
): { ok: true } | { ok: false; error: string } {
  const ctx = accessContextFromVisit(role, userId ?? "", assignedUserId);
  const result = assertActionPermission(ctx, action);
  return result ? { ok: false, error: result.error } : { ok: true };
}

async function recordLeadVisitAudit(
  input: {
    leadId: string;
    actorUserId: string;
    type: string;
    payload: PrismaNamespace.InputJsonValue;
  },
  tx: ExtendedTransactionClient,
) {
  await tx.leadEvent.create({
    data: {
      leadId: input.leadId,
      type: input.type,
      payload: input.payload,
      actorUserId: input.actorUserId,
    },
  });
}

function resolveScheduledEndAt(input: LeadVisitScheduleDetailsInput): Date {
  if (input.scheduledEndAt) return input.scheduledEndAt;
  const durationMinutes = input.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES;
  return new Date(input.scheduledStartAt.getTime() + durationMinutes * 60 * 1000);
}

export function validateScheduleDetailsInput(
  input: LeadVisitScheduleDetailsInput,
): LeadVisitServiceError | null {
  const scheduledEndAt = resolveScheduledEndAt(input);
  if (scheduledEndAt <= input.scheduledStartAt) {
    return { error: "Scheduled end must be after scheduled start." };
  }
  if (
    input.arrivalWindowStartAt &&
    input.arrivalWindowEndAt &&
    input.arrivalWindowEndAt <= input.arrivalWindowStartAt
  ) {
    return { error: "Arrival window end must be after arrival window start." };
  }
  if (input.accessSnapshot) {
    const parsed = parseLeadVisitAccessSnapshot(input.accessSnapshot);
    if ("error" in parsed) return { error: parsed.error };
  }
  if (input.siteContactSnapshot) {
    const parsed = parseLeadVisitSiteContactSnapshot(input.siteContactSnapshot);
    if ("error" in parsed) return { error: parsed.error };
  }
  return null;
}

async function validateAssignedUser(
  organizationId: string,
  assignedUserId: string | null | undefined,
  tx: ExtendedTransactionClient,
): Promise<LeadVisitServiceError | null> {
  if (!assignedUserId) return null;
  const membership = await tx.membership.findFirst({
    where: { organizationId, userId: assignedUserId },
    select: { id: true },
  });
  if (!membership) {
    return { error: "Assigned estimator must belong to this organization." };
  }
  return null;
}

function buildScheduleDetailsWriteData(
  input: LeadVisitScheduleDetailsInput,
): Record<string, unknown> {
  const scheduledEndAt = resolveScheduledEndAt(input);
  const estimatedDurationMinutes =
    input.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES;

  const data: Record<string, unknown> = {
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt,
    confirmedDate: input.scheduledStartAt,
    estimatedDurationMinutes,
    assignedUserId: input.assignedUserId ?? null,
    arrivalWindowStartAt: input.arrivalWindowStartAt ?? null,
    arrivalWindowEndAt: input.arrivalWindowEndAt ?? null,
    arrivalWindowLabel: input.arrivalWindowLabel ?? null,
  };

  if (input.accessSnapshot !== undefined) {
    if (input.accessSnapshot == null) {
      data.accessSnapshotJson = Prisma.DbNull;
    } else {
      data.accessSnapshotJson = parseLeadVisitAccessSnapshot(
        input.accessSnapshot,
      ) as LeadVisitAccessSnapshot;
      data.accessDetailsUpdatedAt = new Date();
    }
  }

  if (input.siteContactSnapshot !== undefined) {
    data.siteContactSnapshotJson =
      input.siteContactSnapshot == null
        ? Prisma.DbNull
        : (parseLeadVisitSiteContactSnapshot(
            input.siteContactSnapshot,
          ) as LeadVisitSiteContactSnapshot);
  }

  if (input.notes != null) {
    data.notes = input.notes;
  }

  return data;
}

function assertConcurrency(
  request: { updatedAt: Date; status: LeadVisitRequestStatus },
  expectedUpdatedAt: Date | undefined,
  action: LeadVisitScheduleAction,
): LeadVisitServiceError | null {
  const transition = validateLeadVisitTransition(request.status, action);
  if (transition) return transition;
  if (!expectedUpdatedAt) return null;
  if (request.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
    return { error: "This visit was updated elsewhere. Refresh and try again." };
  }
  return null;
}

type LeadVisitRequestRow = {
  id: string;
  status: LeadVisitRequestStatus;
  leadId: string;
  updatedAt: Date;
  assignedUserId: string | null;
  scheduledStartAt: Date | null;
  confirmedDate: Date | null;
  accessSnapshotJson: unknown;
  outcome: LeadVisitOutcome | null;
  nextAction: LeadVisitNextAction | null;
  lead: { id: string; title: string };
};

async function loadLeadVisitRequest(
  organizationId: string,
  requestId: string,
  tx: ExtendedTransactionClient,
): Promise<LeadVisitRequestRow | null> {
  return tx.leadVisitRequest.findFirst({
    where: { id: requestId, organizationId },
    select: {
      id: true,
      status: true,
      leadId: true,
      updatedAt: true,
      assignedUserId: true,
      scheduledStartAt: true,
      confirmedDate: true,
      accessSnapshotJson: true,
      outcome: true,
      nextAction: true,
      lead: { select: { id: true, title: true } },
    },
  });
}

export async function confirmLeadVisitRequest(
  input: {
    organizationId: string;
    requestId: string;
    scheduleDetails: LeadVisitScheduleDetailsInput;
    actorUserId: string;
    role: StaffRole;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const detailsError = validateScheduleDetailsInput(input.scheduleDetails);
  if (detailsError) return detailsError;

  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(
    input.role,
    input.actorUserId,
    input.scheduleDetails.assignedUserId ?? request.assignedUserId,
  );
  const permission = assertActionPermission(ctx, "confirm");
  if (permission) return permission;

  const concurrency = assertConcurrency(request, input.expectedUpdatedAt, "confirm");
  if (concurrency) return concurrency;

  const assigneeError = await validateAssignedUser(
    input.organizationId,
    input.scheduleDetails.assignedUserId,
    tx,
  );
  if (assigneeError) return assigneeError;

  const writeData = buildScheduleDetailsWriteData(input.scheduleDetails);

  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.CONFIRMED,
      ...writeData,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_SCHEDULED",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        oldStatus: request.status,
        newStatus: LeadVisitRequestStatus.CONFIRMED,
        oldScheduledStartAt: request.scheduledStartAt?.toISOString() ?? request.confirmedDate?.toISOString() ?? null,
        newScheduledStartAt: input.scheduleDetails.scheduledStartAt.toISOString(),
        newScheduledEndAt: resolveScheduledEndAt(input.scheduleDetails).toISOString(),
        assignedUserId: input.scheduleDetails.assignedUserId ?? null,
        estimatedDurationMinutes:
          input.scheduleDetails.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
        arrivalWindowLabel: input.scheduleDetails.arrivalWindowLabel ?? null,
      },
    },
    tx,
  );

  return { success: true };
}

export async function cancelLeadVisitRequest(
  input: {
    organizationId: string;
    requestId: string;
    note?: string;
    actorUserId: string;
    role: StaffRole;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(input.role, input.actorUserId, request.assignedUserId);
  const permission = assertActionPermission(ctx, "cancel");
  if (permission) return permission;

  const concurrency = assertConcurrency(request, input.expectedUpdatedAt, "cancel");
  if (concurrency) return concurrency;

  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.CANCELED,
      notes: input.note || undefined,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_CANCELED",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        oldStatus: request.status,
        newStatus: LeadVisitRequestStatus.CANCELED,
        note: input.note ?? null,
      },
    },
    tx,
  );

  return { success: true };
}

export async function rescheduleLeadVisitRequest(
  input: {
    organizationId: string;
    requestId: string;
    scheduleDetails: LeadVisitScheduleDetailsInput;
    actorUserId: string;
    role: StaffRole;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const detailsError = validateScheduleDetailsInput(input.scheduleDetails);
  if (detailsError) return detailsError;

  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(
    input.role,
    input.actorUserId,
    input.scheduleDetails.assignedUserId ?? request.assignedUserId,
  );
  const permission = assertActionPermission(ctx, "reschedule");
  if (permission) return permission;

  const concurrency = assertConcurrency(request, input.expectedUpdatedAt, "reschedule");
  if (concurrency) return concurrency;

  const assigneeError = await validateAssignedUser(
    input.organizationId,
    input.scheduleDetails.assignedUserId,
    tx,
  );
  if (assigneeError) return assigneeError;

  const writeData = buildScheduleDetailsWriteData(input.scheduleDetails);
  const oldStart =
    request.scheduledStartAt?.toISOString() ?? request.confirmedDate?.toISOString() ?? null;

  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.CONFIRMED,
      ...writeData,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_RESCHEDULED",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        oldScheduledStartAt: oldStart,
        newScheduledStartAt: input.scheduleDetails.scheduledStartAt.toISOString(),
        newScheduledEndAt: resolveScheduledEndAt(input.scheduleDetails).toISOString(),
        assignedUserId: input.scheduleDetails.assignedUserId ?? null,
        oldAssignedUserId: request.assignedUserId,
      },
    },
    tx,
  );

  return { success: true };
}

export async function updateLeadVisitAccessDetails(
  input: {
    organizationId: string;
    requestId: string;
    accessSnapshot?: LeadVisitAccessSnapshot | null;
    siteContactSnapshot?: LeadVisitSiteContactSnapshot | null;
    actorUserId: string;
    role: StaffRole;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(input.role, input.actorUserId, request.assignedUserId);
  const permission = assertCanMutateLeadVisitSchedule(ctx);
  if (!permission.ok) return { error: permission.error };

  if (
    request.status !== LeadVisitRequestStatus.PENDING &&
    request.status !== LeadVisitRequestStatus.CONFIRMED
  ) {
    return { error: "Access details can only be updated on open visits." };
  }

  if (input.expectedUpdatedAt && request.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { error: "This visit was updated elsewhere. Refresh and try again." };
  }

  let accessSnapshotJson: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (input.accessSnapshot != null) {
    const parsed = parseLeadVisitAccessSnapshot(input.accessSnapshot);
    if ("error" in parsed) return { error: parsed.error };
    accessSnapshotJson = parsed;
  }

  let siteContactSnapshotJson: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (input.siteContactSnapshot != null) {
    const parsed = parseLeadVisitSiteContactSnapshot(input.siteContactSnapshot);
    if ("error" in parsed) return { error: parsed.error };
    siteContactSnapshotJson = parsed;
  }

  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      accessSnapshotJson,
      siteContactSnapshotJson,
      accessDetailsUpdatedAt: new Date(),
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_ACCESS_UPDATED",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        oldAccessSnapshot: request.accessSnapshotJson ?? null,
        newAccessSnapshot: accessSnapshotJson === Prisma.DbNull ? null : accessSnapshotJson,
      },
    },
    tx,
  );

  return { success: true };
}

export async function completeLeadVisitRequest(
  input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    role: StaffRole;
    outcome: LeadVisitOutcome;
    nextAction: LeadVisitNextAction;
    completionNotes?: string;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const pairError = validateOutcomeNextActionPair(input.outcome, input.nextAction);
  if (pairError) return pairError;

  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(input.role, input.actorUserId, request.assignedUserId);
  const permission = assertActionPermission(ctx, "complete");
  if (permission) return permission;

  const concurrency = assertConcurrency(request, input.expectedUpdatedAt, "complete");
  if (concurrency) return concurrency;

  const completedAt = new Date();
  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.COMPLETED,
      completedAt,
      completedByUserId: input.actorUserId,
      completionNotes: input.completionNotes || null,
      outcome: input.outcome,
      nextAction: input.nextAction,
      outcomeSelectedAt: completedAt,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_COMPLETED",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        oldStatus: request.status,
        newStatus: LeadVisitRequestStatus.COMPLETED,
        completedAt: completedAt.toISOString(),
        completionNotes: input.completionNotes ?? null,
        outcome: input.outcome,
        nextAction: input.nextAction,
        oldOutcome: request.outcome,
        oldNextAction: request.nextAction,
      },
    },
    tx,
  );

  return { success: true };
}

export async function markLeadVisitNoShow(
  input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    role: StaffRole;
    outcome: LeadVisitOutcome;
    nextAction: LeadVisitNextAction;
    completionNotes?: string;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const allowedOutcomes: LeadVisitOutcome[] = [
    LeadVisitOutcome.CUSTOMER_NO_SHOW,
    LeadVisitOutcome.CONTRACTOR_MISSED,
  ];
  if (!allowedOutcomes.includes(input.outcome)) {
    return { error: "No-show must use CUSTOMER_NO_SHOW or CONTRACTOR_MISSED outcome." };
  }

  const pairError = validateOutcomeNextActionPair(input.outcome, input.nextAction);
  if (pairError) return pairError;

  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(input.role, input.actorUserId, request.assignedUserId);
  const permission = assertActionPermission(ctx, "no_show");
  if (permission) return permission;

  const concurrency = assertConcurrency(request, input.expectedUpdatedAt, "no_show");
  if (concurrency) return concurrency;

  const completedAt = new Date();
  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.NO_SHOW,
      completedAt,
      completedByUserId: input.actorUserId,
      completionNotes: input.completionNotes || null,
      outcome: input.outcome,
      nextAction: input.nextAction,
      outcomeSelectedAt: completedAt,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_NO_SHOW",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        oldStatus: request.status,
        newStatus: LeadVisitRequestStatus.NO_SHOW,
        completedAt: completedAt.toISOString(),
        completionNotes: input.completionNotes ?? null,
        outcome: input.outcome,
        nextAction: input.nextAction,
      },
    },
    tx,
  );

  return { success: true };
}

export async function updateLeadVisitOutcome(
  input: {
    organizationId: string;
    requestId: string;
    actorUserId: string;
    role: StaffRole;
    outcome: LeadVisitOutcome;
    nextAction: LeadVisitNextAction;
    completionNotes?: string;
    sourceSurface: LeadVisitSourceSurface;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const pairError = validateOutcomeNextActionPair(input.outcome, input.nextAction);
  if (pairError) return pairError;

  const request = await loadLeadVisitRequest(input.organizationId, input.requestId, tx);
  if (!request) return { error: "Visit request not found." };

  const ctx = accessContextFromVisit(input.role, input.actorUserId, request.assignedUserId);
  const permission = assertCanCompleteLeadVisit(ctx);
  if (!permission.ok) return { error: permission.error };

  if (
    request.status !== LeadVisitRequestStatus.COMPLETED &&
    request.status !== LeadVisitRequestStatus.NO_SHOW
  ) {
    return {
      error: "Outcome can only be updated on completed or no-show visits.",
    };
  }

  if (input.expectedUpdatedAt && request.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return { error: "This visit was updated elsewhere. Refresh and try again." };
  }

  const outcomeSelectedAt = new Date();
  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      outcome: input.outcome,
      nextAction: input.nextAction,
      completionNotes: input.completionNotes ?? undefined,
      outcomeSelectedAt,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_OUTCOME_UPDATED",
      payload: {
        requestId: input.requestId,
        sourceSurface: input.sourceSurface,
        status: request.status,
        oldOutcome: request.outcome,
        newOutcome: input.outcome,
        oldNextAction: request.nextAction,
        newNextAction: input.nextAction,
        completionNotes: input.completionNotes ?? null,
      },
    },
    tx,
  );

  return { success: true };
}

/** Resolve canonical scheduled start from stored fields during transition. */
export function resolveLeadVisitScheduledStart(input: {
  scheduledStartAt?: Date | null;
  confirmedDate?: Date | null;
  requestedDate?: Date | null;
}): Date | null {
  return input.scheduledStartAt ?? input.confirmedDate ?? input.requestedDate ?? null;
}

/** MVP 1 display label: CONFIRMED means internally scheduled, not customer-confirmed. */
export function formatLeadVisitStatusLabel(status: LeadVisitRequestStatus): string {
  if (status === LeadVisitRequestStatus.CONFIRMED) return "Scheduled";
  if (status === LeadVisitRequestStatus.PENDING) return "Pending";
  if (status === LeadVisitRequestStatus.COMPLETED) return "Completed";
  if (status === LeadVisitRequestStatus.NO_SHOW) return "No-show";
  if (status === LeadVisitRequestStatus.CANCELED) return "Canceled";
  return status;
}
