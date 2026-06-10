import { JobActivityType } from "@prisma/client";
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
