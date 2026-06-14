"use server";

import {
  JobScheduleEventCompletionOutcome,
  JobScheduleEventKind,
  JobScheduleEventStatus,
  LeadVisitRequestStatus,
  ScheduleBlockType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMutableSession } from "@/lib/session";
import { enqueueNotification } from "@/lib/notifications/notification-outbox";
import { setTaskScheduleActionCore } from "@/lib/task-timing";
import {
  confirmScheduleEvent,
  cancelScheduleEvent,
  completeScheduleEvent,
  createScheduleEvent,
  rescheduleScheduleEvent,
} from "@/lib/scheduling/event-service";
import {
  linkTasksToScheduleEvent,
  unlinkTasksFromScheduleEvent,
} from "@/lib/scheduling/event-link-service";
import { assertSchedulePermission } from "@/lib/scheduling/schedule-permissions";

type ScheduleActionState = {
  error?: string;
  success?: boolean;
  eventId?: string;
};

function requireSchedulePermission(
  role: import("@prisma/client").StaffRole,
  permission: import("@/lib/scheduling/schedule-permissions").SchedulePermission,
): string | null {
  const gate = assertSchedulePermission(role, permission);
  return gate.ok ? null : gate.error;
}

export async function confirmLeadVisitRequestAction(
  requestId: string,
  confirmedDate: Date,
  notifyCustomer: boolean,
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();

  try {
    const request = await db.leadVisitRequest.findFirst({
      where: { id: requestId, organizationId: session.organizationId },
      select: {
        id: true,
        leadId: true,
        lead: { select: { id: true, title: true } },
      },
    });

    if (!request) return { error: "Visit request not found." };

    await db.$transaction(async (tx) => {
      await tx.leadVisitRequest.update({
        where: { id: requestId },
        data: {
          status: LeadVisitRequestStatus.CONFIRMED,
          confirmedDate,
        },
      });

      await enqueueNotification(
        {
          organizationId: session.organizationId,
          kind: "LEAD_VISIT_CONFIRMED",
          title: `Estimate visit confirmed: ${request.lead.title}`,
          body: notifyCustomer
            ? "Customer notification requested."
            : "Customer notification not requested.",
          dedupeKey: `lead-visit-confirmed-${requestId}-${confirmedDate.toISOString()}`,
          payloadJson: {
            requestId,
            leadId: request.leadId,
            confirmedDate: confirmedDate.toISOString(),
            notifyCustomer,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");
    revalidatePath(`/leads/${request.leadId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to confirm lead visit request", error);
    return { error: "Failed to confirm estimate visit." };
  }
}

export async function cancelLeadVisitRequestAction(
  requestId: string,
  note?: string,
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();

  try {
    const request = await db.leadVisitRequest.findFirst({
      where: { id: requestId, organizationId: session.organizationId },
      select: { id: true, leadId: true, lead: { select: { title: true } } },
    });

    if (!request) return { error: "Visit request not found." };

    await db.$transaction(async (tx) => {
      await tx.leadVisitRequest.update({
        where: { id: requestId },
        data: {
          status: LeadVisitRequestStatus.CANCELED,
          notes: note || undefined,
        },
      });

      await enqueueNotification(
        {
          organizationId: session.organizationId,
          kind: "LEAD_VISIT_CANCELED",
          title: `Estimate visit canceled: ${request.lead.title}`,
          body: note,
          dedupeKey: `lead-visit-canceled-${requestId}`,
          payloadJson: {
            requestId,
            leadId: request.leadId,
            note,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath(`/leads/${request.leadId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to cancel lead visit request", error);
    return { error: "Failed to cancel estimate visit request." };
  }
}

export async function rescheduleLeadVisitRequestAction(
  requestId: string,
  confirmedDate: Date,
  notifyCustomer: boolean,
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();

  try {
    const request = await db.leadVisitRequest.findFirst({
      where: { id: requestId, organizationId: session.organizationId },
      select: { id: true, leadId: true, lead: { select: { title: true } } },
    });
    if (!request) return { error: "Visit request not found." };

    await db.$transaction(async (tx) => {
      await tx.leadVisitRequest.update({
        where: { id: requestId },
        data: {
          status: LeadVisitRequestStatus.CONFIRMED,
          confirmedDate,
        },
      });

      await enqueueNotification(
        {
          organizationId: session.organizationId,
          kind: "LEAD_VISIT_RESCHEDULED",
          title: `Estimate visit rescheduled: ${request.lead.title}`,
          body: notifyCustomer
            ? "Customer notification requested."
            : "Customer notification not requested.",
          dedupeKey: `lead-visit-rescheduled-${requestId}-${confirmedDate.toISOString()}`,
          payloadJson: {
            requestId,
            leadId: request.leadId,
            confirmedDate: confirmedDate.toISOString(),
            notifyCustomer,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath(`/leads/${request.leadId}`);
    return { success: true };
  } catch (error) {
    console.error("Failed to reschedule lead visit request", error);
    return { error: "Failed to reschedule estimate visit request." };
  }
}

export async function rescheduleJobScheduleEventFromScheduleAction(
  eventId: string,
  data: {
    startAt: Date;
    endAt: Date;
    reason?: string;
    externalWindowStartAt?: Date | null;
    externalWindowEndAt?: Date | null;
  },
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(
    session.role,
    "reschedule_confirmed",
  );
  if (denied) return { error: denied };
  const result = await rescheduleScheduleEvent({
    organizationId: session.organizationId,
    eventId,
    startAt: data.startAt,
    endAt: data.endAt,
    reason: data.reason,
    externalWindowStartAt: data.externalWindowStartAt,
    externalWindowEndAt: data.externalWindowEndAt,
    actorUserId: session.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

export async function cancelJobScheduleEventFromScheduleAction(
  eventId: string,
  reason: string,
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "cancel");
  if (denied) return { error: denied };
  const result = await cancelScheduleEvent({
    organizationId: session.organizationId,
    eventId,
    reason,
    actorUserId: session.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

export async function completeJobScheduleEventFromScheduleAction(
  eventId: string,
  outcome: JobScheduleEventCompletionOutcome,
  reason?: string,
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "complete");
  if (denied) return { error: denied };
  const result = await completeScheduleEvent({
    organizationId: session.organizationId,
    eventId,
    actorUserId: session.userId,
    outcome,
    reason,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

export async function createJobScheduleEventAction(input: {
  jobId: string;
  kind: JobScheduleEventKind;
  title?: string;
  startAt: Date;
  endAt: Date;
  leadUserId?: string | null;
  notes?: string;
  status?:
    | typeof JobScheduleEventStatus.TENTATIVE
    | typeof JobScheduleEventStatus.CONFIRMED;
  taskIds?: string[];
  externalWindowStartAt?: Date | null;
  externalWindowEndAt?: Date | null;
  externalWindowLabel?: string;
  externalWindowNotes?: string;
  externalWindowSource?: string;
  customerVisible?: boolean;
}): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "create_tentative");
  if (denied) return { error: denied };

  const created = await db.$transaction(async (tx) => {
    const result = await createScheduleEvent(
      {
        organizationId: session.organizationId,
        jobId: input.jobId,
        actorUserId: session.userId,
        kind: input.kind,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        leadUserId: input.leadUserId,
        notes: input.notes,
        status: input.status,
        externalWindowStartAt: input.externalWindowStartAt,
        externalWindowEndAt: input.externalWindowEndAt,
        externalWindowLabel: input.externalWindowLabel,
        externalWindowNotes: input.externalWindowNotes,
        externalWindowSource: input.externalWindowSource,
        customerVisible: input.customerVisible,
      },
      tx,
    );
    if ("error" in result) return result;

    if (input.taskIds && input.taskIds.length > 0) {
      const linked = await linkTasksToScheduleEvent(
        {
          organizationId: session.organizationId,
          eventId: result.eventId,
          taskIds: input.taskIds,
          actorUserId: session.userId,
        },
        tx,
      );
      if ("error" in linked) return linked;
    }

    return { success: true as const, eventId: result.eventId };
  });
  if ("error" in created) return { error: created.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  revalidatePath(`/jobs/${input.jobId}`);
  return { success: true, eventId: created.eventId };
}

export async function confirmJobScheduleEventAction(
  eventId: string,
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "confirm");
  if (denied) return { error: denied };
  const result = await confirmScheduleEvent({
    organizationId: session.organizationId,
    eventId,
    actorUserId: session.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

export async function linkTasksToScheduleEventAction(
  eventId: string,
  taskIds: string[],
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "link_unlink_tasks");
  if (denied) return { error: denied };
  const result = await linkTasksToScheduleEvent({
    organizationId: session.organizationId,
    eventId,
    taskIds,
    actorUserId: session.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

export async function unlinkTasksFromScheduleEventAction(
  eventId: string,
  taskIds: string[],
): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "link_unlink_tasks");
  if (denied) return { error: denied };
  const result = await unlinkTasksFromScheduleEvent({
    organizationId: session.organizationId,
    eventId,
    taskIds,
    actorUserId: session.userId,
  });
  if ("error" in result) return { error: result.error };

  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

export async function upsertScheduleBlockAction(data: {
  blockId?: string;
  title: string;
  type: ScheduleBlockType;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  userId?: string | null;
  notes?: string;
}): Promise<ScheduleActionState> {
  const session = await requireMutableSession();

  if (data.endAt && data.endAt <= data.startAt) {
    return { error: "Schedule block end must be after start." };
  }

  try {
    if (data.blockId) {
      await db.scheduleBlock.updateMany({
        where: { id: data.blockId, organizationId: session.organizationId },
        data: {
          title: data.title,
          type: data.type,
          startAt: data.startAt,
          endAt: data.endAt,
          allDay: data.allDay ?? false,
          userId: data.userId ?? null,
          notes: data.notes,
        },
      });
    } else {
      await db.scheduleBlock.create({
        data: {
          organizationId: session.organizationId,
          title: data.title,
          type: data.type,
          startAt: data.startAt,
          endAt: data.endAt,
          allDay: data.allDay ?? false,
          userId: data.userId ?? null,
          notes: data.notes,
        },
      });
    }

    revalidatePath("/schedule");
    revalidatePath("/workstation/schedule");
    return { success: true };
  } catch (error) {
    console.error("Failed to upsert schedule block", error);
    return { error: "Failed to save schedule block." };
  }
}

export async function updateTaskScheduleFromCalendarAction(data: {
  taskId: string;
  dueAt?: Date | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  assignedUserId?: string | null;
}): Promise<ScheduleActionState> {
  const session = await requireMutableSession();
  const denied = requireSchedulePermission(session.role, "deadline_set_recalc");
  if (denied) return { error: denied };
  if (data.taskId.startsWith("schedule-event-")) {
    return { error: "Task schedule update targeted a schedule event instead of a task." };
  }

  const result = await db.$transaction(async (tx) => {
    const updateResult = await setTaskScheduleActionCore(
      {
        organizationId: session.organizationId,
        taskId: data.taskId,
        dueAt: data.dueAt,
        scheduledStartAt: data.scheduledStartAt,
        scheduledEndAt: data.scheduledEndAt,
        assignedUserId: data.assignedUserId,
      },
      tx,
    );

    if ("error" in updateResult) return updateResult;

    await enqueueNotification(
      {
        organizationId: session.organizationId,
        kind: "TASK_SCHEDULE_UPDATED",
        title: "Task schedule updated",
        dedupeKey: `task-schedule-updated-${data.taskId}-${Date.now()}`,
        payloadJson: {
          taskId: data.taskId,
          dueAt: data.dueAt?.toISOString() ?? null,
          scheduledStartAt: data.scheduledStartAt?.toISOString() ?? null,
          scheduledEndAt: data.scheduledEndAt?.toISOString() ?? null,
          assignedUserId: data.assignedUserId ?? null,
          actorUserId: session.userId,
        },
      },
      tx,
    );

    return { success: true };
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}

