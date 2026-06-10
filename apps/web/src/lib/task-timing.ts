import { TaskDueGranularity } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  setManualTaskDeadline,
  syncDerivedDeadlinesForJob,
} from "@/lib/scheduling/deadline-service";
import { upsertTaskCrewWorkEvent } from "@/lib/scheduling/event-service";

type SyncTaskDueDatesInput = {
  organizationId: string;
  jobId: string;
  actorUserId?: string;
};

export async function syncTaskDueDatesAfterReadiness(
  input: SyncTaskDueDatesInput,
): Promise<{ updatedTaskIds: string[] }> {
  return syncDerivedDeadlinesForJob(input);
}

export async function setTaskScheduleActionCore(
  input: {
    organizationId: string;
    taskId: string;
    dueAt?: Date | null;
    scheduledStartAt?: Date | null;
    scheduledEndAt?: Date | null;
    assignedUserId?: string | null;
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
) {
  const task = await tx.jobTask.findFirst({
    where: {
      id: input.taskId,
      job: { organizationId: input.organizationId },
    },
    select: { id: true, jobId: true, title: true },
  });

  if (!task) {
    return { error: "Task not found or access denied." as const };
  }

  if (input.dueAt !== undefined) {
    const deadlineResult = await setManualTaskDeadline(
      {
        organizationId: input.organizationId,
        taskId: input.taskId,
        dueAt: input.dueAt,
        granularity: TaskDueGranularity.EXACT,
        actorUserId: input.actorUserId,
      },
      tx,
    );
    if ("error" in deadlineResult) return deadlineResult;
  }

  if (
    input.scheduledStartAt !== undefined ||
    input.scheduledEndAt !== undefined ||
    input.assignedUserId !== undefined
  ) {
    const eventResult = await upsertTaskCrewWorkEvent(
      {
        organizationId: input.organizationId,
        taskId: task.id,
        jobId: task.jobId,
        title: task.title,
        startAt: input.scheduledStartAt ?? null,
        endAt: input.scheduledEndAt ?? null,
        leadUserId: input.assignedUserId,
        actorUserId: input.actorUserId,
      },
      tx,
    );
    if ("error" in eventResult) return eventResult;
  }

  return { success: true as const };
}
