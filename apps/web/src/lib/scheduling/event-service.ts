import {
  JobActivityType,
  JobScheduleEventCompletionOutcome,
  JobScheduleEventKind,
  JobScheduleEventStatus,
  type Prisma,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { deriveScheduleConflicts } from "./scheduling-derivation";

export type EventServiceError = { error: string };

export type CreateScheduleEventInput = {
  organizationId: string;
  jobId: string;
  actorUserId?: string;
  kind: JobScheduleEventKind;
  title?: string | null;
  startAt: Date;
  endAt: Date;
  leadUserId?: string | null;
  notes?: string | null;
  externalWindowStartAt?: Date | null;
  externalWindowEndAt?: Date | null;
  externalWindowLabel?: string | null;
  externalWindowNotes?: string | null;
  externalWindowSource?: string | null;
  customerVisible?: boolean;
  status?: typeof JobScheduleEventStatus.TENTATIVE | typeof JobScheduleEventStatus.CONFIRMED;
};

export type RescheduleEventInput = {
  organizationId: string;
  eventId: string;
  actorUserId?: string;
  startAt: Date;
  endAt: Date;
  leadUserId?: string | null;
  reason?: string;
  externalWindowStartAt?: Date | null;
  externalWindowEndAt?: Date | null;
  expectedUpdatedAt?: Date;
};

export type CancelEventInput = {
  organizationId: string;
  eventId: string;
  actorUserId?: string;
  reason: string;
  expectedUpdatedAt?: Date;
};

export type CompleteEventInput = {
  organizationId: string;
  eventId: string;
  actorUserId?: string;
  outcome: JobScheduleEventCompletionOutcome;
  reason?: string;
  expectedUpdatedAt?: Date;
};

function validateWindow(startAt: Date, endAt: Date): EventServiceError | null {
  if (endAt <= startAt) {
    return { error: "Event end time must be after start time." };
  }
  return null;
}

function validateExternalWindow(
  startAt: Date | null | undefined,
  endAt: Date | null | undefined,
): EventServiceError | null {
  if (!startAt && !endAt) return null;
  if (!startAt || !endAt) {
    return { error: "External window requires both start and end." };
  }
  if (endAt <= startAt) {
    return { error: "External window end must be after start." };
  }
  return null;
}

async function loadEvent(
  organizationId: string,
  eventId: string,
  tx: ExtendedTransactionClient,
) {
  return tx.jobScheduleEvent.findFirst({
    where: { id: eventId, organizationId },
    select: {
      id: true,
      jobId: true,
      status: true,
      startAt: true,
      endAt: true,
      leadUserId: true,
      title: true,
      kind: true,
      completionOutcome: true,
      completedAt: true,
      externalWindowStartAt: true,
      externalWindowEndAt: true,
      customerVisible: true,
      updatedAt: true,
    },
  });
}

async function assertNoHardConflicts(
  input: {
    organizationId: string;
    leadUserId: string | null | undefined;
    startAt: Date;
    endAt: Date;
    excludeEventId?: string;
  },
  tx: ExtendedTransactionClient,
): Promise<EventServiceError | null> {
  if (!input.leadUserId) return null;

  const overlapping = await tx.jobScheduleEvent.findMany({
    where: {
      organizationId: input.organizationId,
      leadUserId: input.leadUserId,
      status: { in: [JobScheduleEventStatus.CONFIRMED, JobScheduleEventStatus.TENTATIVE] },
      startAt: { lt: input.endAt },
      endAt: { gt: input.startAt },
      ...(input.excludeEventId ? { id: { not: input.excludeEventId } } : {}),
    },
    select: {
      id: true,
      status: true,
      startAt: true,
      endAt: true,
      leadUserId: true,
    },
  });

  const conflicts = deriveScheduleConflicts(
    overlapping.map((event) => ({
      eventId: event.id,
      assigneeUserId: event.leadUserId,
      status: event.status,
      startAt: event.startAt,
      endAt: event.endAt,
    })).concat({
      eventId: input.excludeEventId ?? "new",
      assigneeUserId: input.leadUserId,
      status: JobScheduleEventStatus.CONFIRMED,
      startAt: input.startAt,
      endAt: input.endAt,
    }),
  );

  const hard = conflicts.find((c) => c.kind === "hard");
  if (hard) {
    return { error: hard.reason };
  }
  return null;
}

async function auditEvent(
  input: {
    organizationId: string;
    jobId: string;
    eventId: string;
    type: JobActivityType;
    title: string;
    details?: string;
    actorUserId?: string;
    metadataJson?: Prisma.InputJsonValue;
  },
  tx: ExtendedTransactionClient,
) {
  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: input.type,
      title: input.title,
      details: input.details,
      entityType: "JobScheduleEvent",
      entityId: input.eventId,
      actorUserId: input.actorUserId,
      metadataJson: input.metadataJson,
    },
    tx,
  );
}

export async function createScheduleEvent(
  input: CreateScheduleEventInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; eventId: string } | EventServiceError> {
  const windowError = validateWindow(input.startAt, input.endAt);
  if (windowError) return windowError;
  const externalWindowError = validateExternalWindow(
    input.externalWindowStartAt,
    input.externalWindowEndAt,
  );
  if (externalWindowError) return externalWindowError;

  const status = input.status ?? JobScheduleEventStatus.TENTATIVE;
  if (status === JobScheduleEventStatus.CONFIRMED) {
    const conflict = await assertNoHardConflicts(
      {
        organizationId: input.organizationId,
        leadUserId: input.leadUserId,
        startAt: input.startAt,
        endAt: input.endAt,
      },
      tx,
    );
    if (conflict) return conflict;
  }

  const event = await tx.jobScheduleEvent.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      kind: input.kind,
      status,
      title: input.title?.trim() || null,
      startAt: input.startAt,
      endAt: input.endAt,
      leadUserId: input.leadUserId ?? null,
      notes: input.notes?.trim() || null,
      externalWindowStartAt: input.externalWindowStartAt ?? null,
      externalWindowEndAt: input.externalWindowEndAt ?? null,
      externalWindowLabel: input.externalWindowLabel?.trim() || null,
      externalWindowNotes: input.externalWindowNotes?.trim() || null,
      externalWindowSource: input.externalWindowSource?.trim() || null,
      customerVisible: input.customerVisible ?? false,
    },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      eventId: event.id,
      type: JobActivityType.SCHEDULE_EVENT_CREATED,
      title: `Schedule event created${event.title ? `: ${event.title}` : ""}`,
      actorUserId: input.actorUserId,
      metadataJson: {
        kind: event.kind,
        status: event.status,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        externalWindowStartAt: input.externalWindowStartAt?.toISOString() ?? null,
        externalWindowEndAt: input.externalWindowEndAt?.toISOString() ?? null,
        customerVisible: input.customerVisible ?? false,
      },
    },
    tx,
  );

  return { success: true, eventId: event.id };
}

export async function confirmScheduleEvent(
  input: {
    organizationId: string;
    eventId: string;
    actorUserId?: string;
    expectedUpdatedAt?: Date;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | EventServiceError> {
  const event = await loadEvent(input.organizationId, input.eventId, tx);
  if (!event) return { error: "Schedule event not found." };
  if (
    input.expectedUpdatedAt &&
    event.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
  ) {
    return { error: "Schedule event changed. Refresh and retry." };
  }
  if (event.status !== JobScheduleEventStatus.TENTATIVE) {
    return { error: "Only tentative events can be confirmed." };
  }

  const conflict = await assertNoHardConflicts(
    {
      organizationId: input.organizationId,
      leadUserId: event.leadUserId,
      startAt: event.startAt,
      endAt: event.endAt,
      excludeEventId: event.id,
    },
    tx,
  );
  if (conflict) return conflict;

  await tx.jobScheduleEvent.update({
    where: { id: event.id },
    data: { status: JobScheduleEventStatus.CONFIRMED },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      eventId: event.id,
      type: JobActivityType.SCHEDULE_EVENT_CONFIRMED,
      title: `Schedule confirmed${event.title ? `: ${event.title}` : ""}`,
      actorUserId: input.actorUserId,
      metadataJson: {
        before: { status: event.status },
        after: { status: JobScheduleEventStatus.CONFIRMED },
      },
    },
    tx,
  );

  return { success: true };
}

export async function rescheduleScheduleEvent(
  input: RescheduleEventInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | EventServiceError> {
  const event = await loadEvent(input.organizationId, input.eventId, tx);
  if (!event) return { error: "Schedule event not found." };
  if (
    input.expectedUpdatedAt &&
    event.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
  ) {
    return { error: "Schedule event changed. Refresh and retry." };
  }
  if (
    event.status !== JobScheduleEventStatus.TENTATIVE &&
    event.status !== JobScheduleEventStatus.CONFIRMED
  ) {
    return { error: "Only tentative or confirmed events can be rescheduled." };
  }

  const windowError = validateWindow(input.startAt, input.endAt);
  if (windowError) return windowError;
  const externalWindowError = validateExternalWindow(
    input.externalWindowStartAt,
    input.externalWindowEndAt,
  );
  if (externalWindowError) return externalWindowError;

  const leadUserId =
    input.leadUserId === undefined ? event.leadUserId : input.leadUserId;

  if (event.status === JobScheduleEventStatus.CONFIRMED) {
    const conflict = await assertNoHardConflicts(
      {
        organizationId: input.organizationId,
        leadUserId,
        startAt: input.startAt,
        endAt: input.endAt,
        excludeEventId: event.id,
      },
      tx,
    );
    if (conflict) return conflict;
  }

  await tx.jobScheduleEvent.update({
    where: { id: event.id },
    data: {
      startAt: input.startAt,
      endAt: input.endAt,
      leadUserId,
      externalWindowStartAt: input.externalWindowStartAt ?? undefined,
      externalWindowEndAt: input.externalWindowEndAt ?? undefined,
    },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      eventId: event.id,
      type: JobActivityType.SCHEDULE_EVENT_RESCHEDULED,
      title: `Schedule rescheduled${event.title ? `: ${event.title}` : ""}`,
      details: input.reason?.trim() || undefined,
      actorUserId: input.actorUserId,
      metadataJson: {
        before: {
          startAt: event.startAt.toISOString(),
          endAt: event.endAt.toISOString(),
          leadUserId: event.leadUserId,
          status: event.status,
          externalWindowStartAt: null,
          externalWindowEndAt: null,
        },
        after: {
          startAt: input.startAt.toISOString(),
          endAt: input.endAt.toISOString(),
          leadUserId,
          status: event.status,
          externalWindowStartAt: input.externalWindowStartAt?.toISOString() ?? null,
          externalWindowEndAt: input.externalWindowEndAt?.toISOString() ?? null,
        },
      },
    },
    tx,
  );

  return { success: true };
}

export async function cancelScheduleEvent(
  input: CancelEventInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | EventServiceError> {
  const event = await loadEvent(input.organizationId, input.eventId, tx);
  if (!event) return { error: "Schedule event not found." };
  if (
    input.expectedUpdatedAt &&
    event.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
  ) {
    return { error: "Schedule event changed. Refresh and retry." };
  }
  if (
    event.status !== JobScheduleEventStatus.TENTATIVE &&
    event.status !== JobScheduleEventStatus.CONFIRMED
  ) {
    return { error: "Event cannot be canceled from its current state." };
  }
  if (event.status === JobScheduleEventStatus.CONFIRMED && !input.reason.trim()) {
    return { error: "A reason is required to cancel a confirmed event." };
  }

  await tx.jobScheduleEvent.update({
    where: { id: event.id },
    data: {
      status: JobScheduleEventStatus.CANCELED,
      completionOutcome: null,
      completedAt: null,
    },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      eventId: event.id,
      type: JobActivityType.SCHEDULE_EVENT_CANCELED,
      title: `Schedule canceled${event.title ? `: ${event.title}` : ""}`,
      details: input.reason.trim() || undefined,
      actorUserId: input.actorUserId,
      metadataJson: {
        before: { status: event.status },
        after: { status: JobScheduleEventStatus.CANCELED },
        reason: input.reason.trim(),
      },
    },
    tx,
  );

  return { success: true };
}

export async function completeScheduleEvent(
  input: CompleteEventInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | EventServiceError> {
  const event = await loadEvent(input.organizationId, input.eventId, tx);
  if (!event) return { error: "Schedule event not found." };
  if (event.status !== JobScheduleEventStatus.CONFIRMED) {
    return { error: "Only confirmed events can be completed." };
  }

  await tx.jobScheduleEvent.update({
    where: { id: event.id },
    data: {
      status: JobScheduleEventStatus.COMPLETED,
      completionOutcome: input.outcome,
      completedAt: new Date(),
    },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      eventId: event.id,
      type: JobActivityType.SCHEDULE_EVENT_COMPLETED,
      title: `Schedule completed${event.title ? `: ${event.title}` : ""}`,
      details: input.reason?.trim() || undefined,
      actorUserId: input.actorUserId,
      metadataJson: {
        before: {
          status: event.status,
          completionOutcome: event.completionOutcome,
          completedAt: event.completedAt?.toISOString() ?? null,
        },
        after: {
          status: JobScheduleEventStatus.COMPLETED,
          completionOutcome: input.outcome,
        },
      },
    },
    tx,
  );

  return { success: true };
}

export async function correctTerminalScheduleEvent(
  input: {
    organizationId: string;
    eventId: string;
    actorUserId?: string;
    status:
      | typeof JobScheduleEventStatus.COMPLETED
      | typeof JobScheduleEventStatus.CANCELED;
    outcome?: JobScheduleEventCompletionOutcome | null;
    reason: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | EventServiceError> {
  if (!input.reason.trim()) {
    return { error: "A reason is required to correct a terminal event." };
  }
  const event = await loadEvent(input.organizationId, input.eventId, tx);
  if (!event) return { error: "Schedule event not found." };
  if (
    event.status !== JobScheduleEventStatus.COMPLETED &&
    event.status !== JobScheduleEventStatus.CANCELED
  ) {
    return { error: "Only terminal events can be corrected." };
  }

  await tx.jobScheduleEvent.update({
    where: { id: event.id },
    data: {
      status: input.status,
      completionOutcome:
        input.status === JobScheduleEventStatus.COMPLETED ? input.outcome ?? null : null,
      completedAt: input.status === JobScheduleEventStatus.COMPLETED ? new Date() : null,
    },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      eventId: event.id,
      type: JobActivityType.SCHEDULE_EVENT_RESCHEDULED,
      title: `Schedule terminal correction${event.title ? `: ${event.title}` : ""}`,
      details: input.reason.trim(),
      actorUserId: input.actorUserId,
      metadataJson: {
        before: {
          status: event.status,
          completionOutcome: event.completionOutcome,
          completedAt: event.completedAt?.toISOString() ?? null,
        },
        after: {
          status: input.status,
          completionOutcome:
            input.status === JobScheduleEventStatus.COMPLETED ? input.outcome ?? null : null,
        },
        reason: input.reason.trim(),
      },
    },
    tx,
  );

  return { success: true };
}

/** Upsert a crew-work event linked to a task (replaces legacy scheduledStartAt writes). */
export async function upsertTaskCrewWorkEvent(
  input: {
    organizationId: string;
    taskId: string;
    jobId: string;
    title: string;
    startAt: Date | null;
    endAt: Date | null;
    leadUserId?: string | null;
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; eventId?: string } | EventServiceError> {
  const existingLink = await tx.jobScheduleEventTask.findFirst({
    where: {
      jobTaskId: input.taskId,
      jobScheduleEvent: {
        organizationId: input.organizationId,
        kind: JobScheduleEventKind.CREW_WORK,
        status: {
          in: [
            JobScheduleEventStatus.TENTATIVE,
            JobScheduleEventStatus.CONFIRMED,
          ],
        },
      },
    },
    select: {
      jobScheduleEvent: {
        select: { id: true, status: true },
      },
    },
  });

  if (!input.startAt) {
    if (existingLink) {
      await cancelScheduleEvent(
        {
          organizationId: input.organizationId,
          eventId: existingLink.jobScheduleEvent.id,
          actorUserId: input.actorUserId,
          reason: "Task schedule block cleared.",
        },
        tx,
      );
    }
    return { success: true };
  }

  const endAt =
    input.endAt ??
    new Date(input.startAt.getTime() + 2 * 60 * 60 * 1000);
  const windowError = validateWindow(input.startAt, endAt);
  if (windowError) return windowError;

  if (existingLink) {
    const result = await rescheduleScheduleEvent(
      {
        organizationId: input.organizationId,
        eventId: existingLink.jobScheduleEvent.id,
        startAt: input.startAt,
        endAt,
        leadUserId: input.leadUserId,
        actorUserId: input.actorUserId,
      },
      tx,
    );
    if ("error" in result) return result;
    return { success: true, eventId: existingLink.jobScheduleEvent.id };
  }

  const created = await createScheduleEvent(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      kind: JobScheduleEventKind.CREW_WORK,
      title: input.title,
      startAt: input.startAt,
      endAt,
      leadUserId: input.leadUserId,
      status: JobScheduleEventStatus.CONFIRMED,
      actorUserId: input.actorUserId,
    },
    tx,
  );
  if ("error" in created) return created;

  await tx.jobScheduleEventTask.create({
    data: {
      jobScheduleEventId: created.eventId,
      jobTaskId: input.taskId,
    },
  });

  await auditEvent(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      eventId: created.eventId,
      type: JobActivityType.SCHEDULE_EVENT_TASK_LINKED,
      title: `Task linked to schedule: ${input.title}`,
      actorUserId: input.actorUserId,
      metadataJson: { taskId: input.taskId },
    },
    tx,
  );

  return { success: true, eventId: created.eventId };
}
