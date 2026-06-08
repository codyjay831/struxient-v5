"use server";

import { LeadVisitRequestStatus, ScheduleBlockType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { enqueueNotification } from "@/lib/notifications/notification-outbox";
import { rescheduleJobVisitAction } from "@/app/(workspace)/jobs/job-visit-actions";
import { setTaskScheduleActionCore } from "@/lib/task-timing";

type ScheduleActionState = {
  error?: string;
  success?: boolean;
};

export async function confirmLeadVisitRequestAction(
  requestId: string,
  confirmedDate: Date,
  notifyCustomer: boolean,
): Promise<ScheduleActionState> {
  const session = await requireCurrentSession();

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
  const session = await requireCurrentSession();

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
  const session = await requireCurrentSession();

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

export async function rescheduleJobVisitFromScheduleAction(
  visitId: string,
  data: {
    scheduledStartAt: Date;
    scheduledEndAt?: Date;
    notes?: string;
  },
): Promise<ScheduleActionState> {
  const result = await rescheduleJobVisitAction(visitId, data);
  if (result.error) return { error: result.error };

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
  const session = await requireCurrentSession();

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
  const session = await requireCurrentSession();

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

