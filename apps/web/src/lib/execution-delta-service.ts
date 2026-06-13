import { JobActivityType, JobScopeItemStatus, JobTaskStatus } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";

export async function createScopeItemDeltaInTx(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    jobId: string;
    sourceQuoteScopeRevisionLineId: string;
    description: string;
    quantity: string;
    unitPriceCents: number | null;
    executionRelevant: boolean;
  },
) {
  return tx.jobScopeItem.create({
    data: {
      organizationId: params.organizationId,
      jobId: params.jobId,
      sourceQuoteScopeRevisionLineId: params.sourceQuoteScopeRevisionLineId,
      description: params.description,
      quantity: params.quantity,
      unitPriceCents: params.unitPriceCents,
      executionRelevant: params.executionRelevant,
      status: JobScopeItemStatus.ACTIVE,
    },
    select: { id: true },
  });
}

export async function relinkFutureTaskScopesForSupersessionInTx(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    sourceScopeItemId: string;
    replacementScopeItemId: string;
  },
) {
  const scopedTasks = await tx.jobTaskScope.findMany({
    where: { jobScopeItemId: params.sourceScopeItemId },
    select: {
      jobTaskId: true,
      jobTask: { select: { status: true } },
    },
  });
  for (const taskScope of scopedTasks) {
    const status = taskScope.jobTask.status;
    if (status === JobTaskStatus.DONE || status === JobTaskStatus.CANCELED) continue;
    await tx.jobTaskScope.upsert({
      where: {
        jobTaskId_jobScopeItemId: {
          jobTaskId: taskScope.jobTaskId,
          jobScopeItemId: params.replacementScopeItemId,
        },
      },
      create: {
        organizationId: params.organizationId,
        jobTaskId: taskScope.jobTaskId,
        jobScopeItemId: params.replacementScopeItemId,
      },
      update: {},
    });
    await tx.jobTaskScope.deleteMany({
      where: {
        jobTaskId: taskScope.jobTaskId,
        jobScopeItemId: params.sourceScopeItemId,
      },
    });
  }
}

export async function cancelTaskAsExecutionDeltaInTx(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    jobId: string;
    taskId: string;
    taskTitle: string;
    actorUserId: string;
    reason: string;
    metadataJson?: Record<string, unknown>;
  },
) {
  const existing = await tx.jobTask.findUnique({
    where: { id: params.taskId },
    select: { id: true, status: true, canceledAt: true },
  });
  if (!existing) return { ok: false as const, error: "TASK_NOT_FOUND" as const };
  if (existing.status === JobTaskStatus.DONE || existing.status === JobTaskStatus.CANCELED) {
    return { ok: true as const };
  }
  await tx.jobTask.update({
    where: { id: params.taskId },
    data: {
      status: JobTaskStatus.CANCELED,
      canceledAt: existing.canceledAt ?? new Date(),
      canceledByUserId: params.actorUserId,
      canceledReason: params.reason,
    },
  });
  await recordJobActivity(
    {
      organizationId: params.organizationId,
      jobId: params.jobId,
      type: JobActivityType.TASK_CANCELED,
      title: `Task canceled: ${params.taskTitle}`,
      entityType: "JobTask",
      entityId: params.taskId,
      actorUserId: params.actorUserId,
      metadataJson: {
        source: "execution-delta",
        ...params.metadataJson,
      },
    },
    tx,
  );
  return { ok: true as const };
}

export async function removeScopeItemAndApplyFutureTaskDispositionInTx(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    jobId: string;
    sourceScopeItemId: string;
    actorUserId: string;
    canceledReason: string;
    metadataJson?: Record<string, unknown>;
  },
) {
  await tx.jobScopeItem.update({
    where: { id: params.sourceScopeItemId },
    data: { status: JobScopeItemStatus.REMOVED },
  });
  const scopedTasks = await tx.jobTaskScope.findMany({
    where: { jobScopeItemId: params.sourceScopeItemId },
    select: {
      jobTaskId: true,
      jobTask: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
  });
  for (const taskScope of scopedTasks) {
    const task = taskScope.jobTask;
    if (task.status === JobTaskStatus.DONE || task.status === JobTaskStatus.CANCELED) continue;
    const remainingScopesCount = await tx.jobTaskScope.count({
      where: {
        jobTaskId: task.id,
        jobScopeItemId: { not: params.sourceScopeItemId },
      },
    });
    if (remainingScopesCount > 0) {
      await tx.jobTaskScope.deleteMany({
        where: {
          jobTaskId: task.id,
          jobScopeItemId: params.sourceScopeItemId,
        },
      });
      continue;
    }
    await cancelTaskAsExecutionDeltaInTx(tx, {
      organizationId: params.organizationId,
      jobId: params.jobId,
      taskId: task.id,
      taskTitle: task.title,
      actorUserId: params.actorUserId,
      reason: params.canceledReason,
      metadataJson: params.metadataJson,
    });
  }
}
