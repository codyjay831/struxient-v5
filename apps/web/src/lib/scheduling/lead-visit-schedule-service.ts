import { LeadVisitRequestStatus, StaffRole, type Prisma } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { enqueueNotification } from "@/lib/notifications/notification-outbox";
import {
  assertSchedulePermission,
  type SchedulePermission,
} from "./schedule-permissions";

export type LeadVisitScheduleAction =
  | "confirm"
  | "cancel"
  | "reschedule"
  | "complete"
  | "no_show";

export type LeadVisitServiceError = { error: string };

const LEAD_VISIT_PERMISSION: Record<LeadVisitScheduleAction, SchedulePermission> = {
  confirm: "confirm",
  cancel: "cancel",
  reschedule: "reschedule_confirmed",
  complete: "confirm",
  no_show: "confirm",
};

export function getLeadVisitActionPermission(
  role: StaffRole,
  action: LeadVisitScheduleAction,
): { ok: true } | { ok: false; error: string } {
  return assertSchedulePermission(role, LEAD_VISIT_PERMISSION[action]);
}

export function validateLeadVisitTransition(
  status: LeadVisitRequestStatus,
  action: LeadVisitScheduleAction,
): LeadVisitServiceError | null {
  if (action === "confirm" && status !== LeadVisitRequestStatus.PENDING) {
    return { error: "Only pending estimate visits can be confirmed." };
  }
  if (action === "reschedule" && status !== LeadVisitRequestStatus.CONFIRMED) {
    return { error: "Only confirmed estimate visits can be rescheduled." };
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
    return { error: "Only confirmed estimate visits can be completed." };
  }
  if (action === "no_show" && status !== LeadVisitRequestStatus.CONFIRMED) {
    return { error: "Only confirmed estimate visits can be marked no-show." };
  }
  return null;
}

async function recordLeadVisitAudit(
  input: {
    leadId: string;
    actorUserId: string;
    type: string;
    payload: Prisma.InputJsonValue;
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

export async function confirmLeadVisitRequest(
  input: {
    organizationId: string;
    requestId: string;
    confirmedDate: Date;
    notifyCustomer: boolean;
    actorUserId: string;
    role: StaffRole;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const permission = getLeadVisitActionPermission(input.role, "confirm");
  if (!permission.ok) return { error: permission.error };

  const request = await tx.leadVisitRequest.findFirst({
    where: { id: input.requestId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      leadId: true,
      lead: { select: { id: true, title: true } },
    },
  });
  if (!request) return { error: "Visit request not found." };

  const transition = validateLeadVisitTransition(request.status, "confirm");
  if (transition) return transition;

  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.CONFIRMED,
      confirmedDate: input.confirmedDate,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_CONFIRMED",
      payload: {
        requestId: input.requestId,
        confirmedDate: input.confirmedDate.toISOString(),
        notifyCustomer: input.notifyCustomer,
      },
    },
    tx,
  );

  await enqueueNotification(
    {
      organizationId: input.organizationId,
      kind: "LEAD_VISIT_CONFIRMED",
      title: `Estimate visit confirmed: ${request.lead.title}`,
      body: input.notifyCustomer
        ? "Customer notification requested."
        : "Customer notification not requested.",
      dedupeKey: `lead-visit-confirmed-${input.requestId}-${input.confirmedDate.toISOString()}`,
      payloadJson: {
        requestId: input.requestId,
        leadId: request.leadId,
        confirmedDate: input.confirmedDate.toISOString(),
        notifyCustomer: input.notifyCustomer,
        actorUserId: input.actorUserId,
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
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const permission = getLeadVisitActionPermission(input.role, "cancel");
  if (!permission.ok) return { error: permission.error };

  const request = await tx.leadVisitRequest.findFirst({
    where: { id: input.requestId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      leadId: true,
      lead: { select: { title: true } },
    },
  });
  if (!request) return { error: "Visit request not found." };

  const transition = validateLeadVisitTransition(request.status, "cancel");
  if (transition) return transition;

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
        note: input.note ?? null,
      },
    },
    tx,
  );

  await enqueueNotification(
    {
      organizationId: input.organizationId,
      kind: "LEAD_VISIT_CANCELED",
      title: `Estimate visit canceled: ${request.lead.title}`,
      body: input.note,
      dedupeKey: `lead-visit-canceled-${input.requestId}`,
      payloadJson: {
        requestId: input.requestId,
        leadId: request.leadId,
        note: input.note,
        actorUserId: input.actorUserId,
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
    confirmedDate: Date;
    notifyCustomer: boolean;
    actorUserId: string;
    role: StaffRole;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const permission = getLeadVisitActionPermission(input.role, "reschedule");
  if (!permission.ok) return { error: permission.error };

  const request = await tx.leadVisitRequest.findFirst({
    where: { id: input.requestId, organizationId: input.organizationId },
    select: {
      id: true,
      status: true,
      leadId: true,
      lead: { select: { title: true } },
    },
  });
  if (!request) return { error: "Visit request not found." };

  const transition = validateLeadVisitTransition(request.status, "reschedule");
  if (transition) return transition;

  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.CONFIRMED,
      confirmedDate: input.confirmedDate,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_RESCHEDULED",
      payload: {
        requestId: input.requestId,
        confirmedDate: input.confirmedDate.toISOString(),
        notifyCustomer: input.notifyCustomer,
      },
    },
    tx,
  );

  await enqueueNotification(
    {
      organizationId: input.organizationId,
      kind: "LEAD_VISIT_RESCHEDULED",
      title: `Estimate visit rescheduled: ${request.lead.title}`,
      body: input.notifyCustomer
        ? "Customer notification requested."
        : "Customer notification not requested.",
      dedupeKey: `lead-visit-rescheduled-${input.requestId}-${input.confirmedDate.toISOString()}`,
      payloadJson: {
        requestId: input.requestId,
        leadId: request.leadId,
        confirmedDate: input.confirmedDate.toISOString(),
        notifyCustomer: input.notifyCustomer,
        actorUserId: input.actorUserId,
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
    completionNotes?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const permission = getLeadVisitActionPermission(input.role, "complete");
  if (!permission.ok) return { error: permission.error };

  const request = await tx.leadVisitRequest.findFirst({
    where: { id: input.requestId, organizationId: input.organizationId },
    select: { id: true, status: true, leadId: true },
  });
  if (!request) return { error: "Visit request not found." };

  const transition = validateLeadVisitTransition(request.status, "complete");
  if (transition) return transition;

  const completedAt = new Date();
  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.COMPLETED,
      completedAt,
      completedByUserId: input.actorUserId,
      completionNotes: input.completionNotes || null,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_COMPLETED",
      payload: {
        requestId: input.requestId,
        completedAt: completedAt.toISOString(),
        completionNotes: input.completionNotes ?? null,
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
    completionNotes?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LeadVisitServiceError> {
  const permission = getLeadVisitActionPermission(input.role, "no_show");
  if (!permission.ok) return { error: permission.error };

  const request = await tx.leadVisitRequest.findFirst({
    where: { id: input.requestId, organizationId: input.organizationId },
    select: { id: true, status: true, leadId: true },
  });
  if (!request) return { error: "Visit request not found." };

  const transition = validateLeadVisitTransition(request.status, "no_show");
  if (transition) return transition;

  const completedAt = new Date();
  await tx.leadVisitRequest.update({
    where: { id: input.requestId },
    data: {
      status: LeadVisitRequestStatus.NO_SHOW,
      completedAt,
      completedByUserId: input.actorUserId,
      completionNotes: input.completionNotes || null,
    },
  });

  await recordLeadVisitAudit(
    {
      leadId: request.leadId,
      actorUserId: input.actorUserId,
      type: "LEAD_VISIT_NO_SHOW",
      payload: {
        requestId: input.requestId,
        completedAt: completedAt.toISOString(),
        completionNotes: input.completionNotes ?? null,
      },
    },
    tx,
  );

  return { success: true };
}
