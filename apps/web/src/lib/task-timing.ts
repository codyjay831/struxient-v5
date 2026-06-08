import { JobIssueSeverity, JobIssueStatus, JobTaskStatus } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { deriveTaskState, toTaskReadinessInput } from "@/lib/task-readiness";
import { getLiveSignals } from "@/lib/signal-bus";
import { enqueueNotification } from "@/lib/notifications/notification-outbox";

type SyncTaskDueDatesInput = {
  organizationId: string;
  jobId: string;
  actorUserId?: string;
};

export async function syncTaskDueDatesAfterReadiness({
  organizationId,
  jobId,
}: SyncTaskDueDatesInput): Promise<{ updatedTaskIds: string[] }> {
  const [tasks, liveSignals] = await Promise.all([
    db.jobTask.findMany({
      where: {
        jobId,
        status: JobTaskStatus.TODO,
        dueAt: null,
        dueOffsetMinutesAfterReady: { not: null },
      },
      select: {
        id: true,
        title: true,
        jobId: true,
        jobStageId: true,
        dueOffsetMinutesAfterReady: true,
        requiresSignals: true,
        status: true,
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
          select: { id: true, status: true, severity: true },
        },
        jobStage: {
          select: {
            issues: {
              where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
              select: { id: true, status: true, severity: true },
            },
          },
        },
        recoveryFlow: {
          select: { jobIssueId: true },
        },
      },
    }),
    getLiveSignals(jobId),
  ]);

  const updates: Array<{ taskId: string; dueAt: Date; title: string }> = [];
  const now = new Date();

  for (const task of tasks) {
    const state = deriveTaskState(
      toTaskReadinessInput(task, {
        requiresSignals: [],
        issues: task.jobStage.issues,
      }),
      liveSignals,
      { recoveryFlowIssueId: task.recoveryFlow?.jobIssueId },
    );

    if (state !== "READY") continue;

    const offsetMinutes = task.dueOffsetMinutesAfterReady ?? 0;
    const dueAt = new Date(now.getTime() + offsetMinutes * 60 * 1000);
    updates.push({ taskId: task.id, dueAt, title: task.title });
  }

  if (updates.length === 0) {
    return { updatedTaskIds: [] };
  }

  await db.$transaction(async (tx) => {
    for (const update of updates) {
      await tx.jobTask.update({
        where: { id: update.taskId },
        data: { dueAt: update.dueAt },
      });

      await enqueueNotification(
        {
          organizationId,
          kind: "TASK_UNLOCKED_DUE_ASSIGNED",
          title: `Task unlocked: ${update.title}`,
          body: `A due date was assigned automatically for this task.`,
          dedupeKey: `task-unlocked-due-${update.taskId}-${update.dueAt.toISOString()}`,
          payloadJson: {
            jobId,
            taskId: update.taskId,
            dueAt: update.dueAt.toISOString(),
          },
        },
        tx,
      );
    }
  });

  return { updatedTaskIds: updates.map((u) => u.taskId) };
}

export async function setTaskScheduleActionCore(
  input: {
    organizationId: string;
    taskId: string;
    dueAt?: Date | null;
    scheduledStartAt?: Date | null;
    scheduledEndAt?: Date | null;
    assignedUserId?: string | null;
  },
  tx: ExtendedTransactionClient = db,
) {
  if (
    input.scheduledStartAt &&
    input.scheduledEndAt &&
    input.scheduledEndAt <= input.scheduledStartAt
  ) {
    return { error: "Task end time must be after start time." as const };
  }

  const task = await tx.jobTask.findFirst({
    where: {
      id: input.taskId,
      job: { organizationId: input.organizationId },
    },
    select: { id: true },
  });

  if (!task) {
    return { error: "Task not found or access denied." as const };
  }

  await tx.jobTask.update({
    where: { id: input.taskId },
    data: {
      dueAt:
        input.dueAt === undefined
          ? undefined
          : input.dueAt,
      scheduledStartAt:
        input.scheduledStartAt === undefined
          ? undefined
          : input.scheduledStartAt,
      scheduledEndAt:
        input.scheduledEndAt === undefined
          ? undefined
          : input.scheduledEndAt,
      assignedUserId:
        input.assignedUserId === undefined
          ? undefined
          : input.assignedUserId,
    },
  });

  return { success: true as const };
}

