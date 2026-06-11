import { JobActivityType, JobScheduleEventStatus } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";

export type LinkServiceError = { error: string };

export async function linkTaskToScheduleEvent(
  input: {
    organizationId: string;
    eventId: string;
    taskId: string;
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LinkServiceError> {
  const event = await tx.jobScheduleEvent.findFirst({
    where: { id: input.eventId, organizationId: input.organizationId },
    select: { id: true, jobId: true, title: true },
  });
  if (!event) return { error: "Schedule event not found." };
  const terminalStatus = await tx.jobScheduleEvent.findUnique({
    where: { id: event.id },
    select: { status: true },
  });
  if (
    terminalStatus?.status === JobScheduleEventStatus.CANCELED ||
    terminalStatus?.status === JobScheduleEventStatus.COMPLETED
  ) {
    return { error: "Cannot link tasks to a terminal schedule event." };
  }

  const task = await tx.jobTask.findFirst({
    where: {
      id: input.taskId,
      jobId: event.jobId,
      job: { organizationId: input.organizationId },
    },
    select: { id: true, title: true },
  });
  if (!task) return { error: "Task not found on this job." };

  await tx.jobScheduleEventTask.upsert({
    where: {
      jobScheduleEventId_jobTaskId: {
        jobScheduleEventId: event.id,
        jobTaskId: task.id,
      },
    },
    create: {
      jobScheduleEventId: event.id,
      jobTaskId: task.id,
    },
    update: {},
  });

  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      type: JobActivityType.SCHEDULE_EVENT_TASK_LINKED,
      title: `Task linked: ${task.title}`,
      entityType: "JobScheduleEvent",
      entityId: event.id,
      actorUserId: input.actorUserId,
      metadataJson: { taskId: task.id },
    },
    tx,
  );

  return { success: true };
}

export async function unlinkTaskFromScheduleEvent(
  input: {
    organizationId: string;
    eventId: string;
    taskId: string;
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | LinkServiceError> {
  const event = await tx.jobScheduleEvent.findFirst({
    where: { id: input.eventId, organizationId: input.organizationId },
    select: { id: true, jobId: true },
  });
  if (!event) return { error: "Schedule event not found." };
  const terminalStatus = await tx.jobScheduleEvent.findUnique({
    where: { id: event.id },
    select: { status: true },
  });
  if (
    terminalStatus?.status === JobScheduleEventStatus.CANCELED ||
    terminalStatus?.status === JobScheduleEventStatus.COMPLETED
  ) {
    return { error: "Cannot unlink tasks from a terminal schedule event." };
  }

  const link = await tx.jobScheduleEventTask.findFirst({
    where: {
      jobScheduleEventId: event.id,
      jobTaskId: input.taskId,
    },
    select: {
      jobTask: { select: { title: true } },
    },
  });
  if (!link) return { error: "Task is not linked to this event." };

  await tx.jobScheduleEventTask.deleteMany({
    where: {
      jobScheduleEventId: event.id,
      jobTaskId: input.taskId,
    },
  });

  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: event.jobId,
      type: JobActivityType.SCHEDULE_EVENT_TASK_UNLINKED,
      title: `Task unlinked: ${link.jobTask.title}`,
      entityType: "JobScheduleEvent",
      entityId: event.id,
      actorUserId: input.actorUserId,
      metadataJson: { taskId: input.taskId },
    },
    tx,
  );

  return { success: true };
}

export async function linkTasksToScheduleEvent(
  input: {
    organizationId: string;
    eventId: string;
    taskIds: string[];
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; linkedCount: number } | LinkServiceError> {
  const uniqueTaskIds = [...new Set(input.taskIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueTaskIds.length === 0) return { success: true, linkedCount: 0 };

  for (const taskId of uniqueTaskIds) {
    const linked = await linkTaskToScheduleEvent(
      {
        organizationId: input.organizationId,
        eventId: input.eventId,
        taskId,
        actorUserId: input.actorUserId,
      },
      tx,
    );
    if ("error" in linked) return linked;
  }
  return { success: true, linkedCount: uniqueTaskIds.length };
}

export async function unlinkTasksFromScheduleEvent(
  input: {
    organizationId: string;
    eventId: string;
    taskIds: string[];
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; unlinkedCount: number } | LinkServiceError> {
  const uniqueTaskIds = [...new Set(input.taskIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueTaskIds.length === 0) return { success: true, unlinkedCount: 0 };

  for (const taskId of uniqueTaskIds) {
    const unlinked = await unlinkTaskFromScheduleEvent(
      {
        organizationId: input.organizationId,
        eventId: input.eventId,
        taskId,
        actorUserId: input.actorUserId,
      },
      tx,
    );
    if ("error" in unlinked) return unlinked;
  }
  return { success: true, unlinkedCount: uniqueTaskIds.length };
}

export async function loadLinkedEventsForTask(
  taskId: string,
  organizationId: string,
) {
  return db.jobScheduleEvent.findMany({
    where: {
      organizationId,
      taskLinks: { some: { jobTaskId: taskId } },
    },
    select: {
      id: true,
      kind: true,
      status: true,
      title: true,
      startAt: true,
      endAt: true,
      leadUserId: true,
    },
    orderBy: { startAt: "asc" },
  });
}
