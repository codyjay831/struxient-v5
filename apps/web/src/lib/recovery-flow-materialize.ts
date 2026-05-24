import {
  JobActivityType,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
} from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { CORRECTIONS_STAGE_NAME } from "@/lib/job-payment-readiness";

const MAX_RECOVERY_TASKS = 50;

export type RecoveryFlowTaskInput = {
  title: string;
  category: TaskTemplateCategory;
  instructions?: string;
  sortOrder?: number;
  completionRequirementsJson?: unknown;
  providesSignals?: string[];
  requiresSignals?: string[];
  hardSignal?: boolean;
};

export type MaterializeRecoveryFlowInput = {
  organizationId: string;
  jobIssueId: string;
  jobId: string;
  issueTitle: string;
  tasks: RecoveryFlowTaskInput[];
  actorUserId: string;
  sourceFailedTaskId?: string;
  sourceChecklistItemId?: string;
  sourcePermitEventId?: string;
  sourceInspectionEventId?: string;
};

export type MaterializeRecoveryFlowResult = {
  flowId: string;
  taskIds: string[];
};

type RecoveryFlowSourceTaskValidationParams = {
  tx: ExtendedTransactionClient;
  organizationId: string;
  jobId: string;
  sourceFailedTaskId: string;
};

async function assertValidSourceFailedTaskId(
  params: RecoveryFlowSourceTaskValidationParams,
): Promise<void> {
  const task = await params.tx.jobTask.findFirst({
    where: {
      id: params.sourceFailedTaskId,
      jobId: params.jobId,
      job: { organizationId: params.organizationId },
    },
    select: { id: true },
  });

  if (!task) {
    throw new Error(
      "sourceFailedTaskId must reference a task in the same job and organization.",
    );
  }
}

async function resolveRecoveryFlowSourceFailedTaskId(params: {
  tx: ExtendedTransactionClient;
  organizationId: string;
  jobId: string;
  explicitSourceFailedTaskId?: string;
  issueJobTaskId?: string | null;
}): Promise<string | undefined> {
  const explicitId = params.explicitSourceFailedTaskId?.trim();
  if (explicitId) {
    await assertValidSourceFailedTaskId({
      tx: params.tx,
      organizationId: params.organizationId,
      jobId: params.jobId,
      sourceFailedTaskId: explicitId,
    });
    return explicitId;
  }

  return params.issueJobTaskId ?? undefined;
}

export function validateRecoveryFlowTasksInput(
  tasks: RecoveryFlowTaskInput[],
): RecoveryFlowTaskInput[] {
  if (tasks.length === 0) {
    throw new Error("Add at least one recovery step before activating.");
  }
  if (tasks.length > MAX_RECOVERY_TASKS) {
    throw new Error(`Recovery path cannot exceed ${MAX_RECOVERY_TASKS} steps.`);
  }

  return tasks.map((task, index) => {
    const title = task.title.trim();
    if (!title) {
      throw new Error("All recovery steps must have a title.");
    }
    const sortOrder = task.sortOrder ?? index * 10;
    return {
      ...task,
      title,
      sortOrder,
    };
  });
}

async function ensureCorrectionsJobStageInTx(
  tx: ExtendedTransactionClient,
  organizationId: string,
  jobId: string,
): Promise<{ jobStageId: string; correctionsStageId: string }> {
  let correctionsStage = await tx.stage.findFirst({
    where: {
      organizationId,
      name: CORRECTIONS_STAGE_NAME,
      archivedAt: null,
    },
  });

  if (!correctionsStage) {
    const maxSort = await tx.stage.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    correctionsStage = await tx.stage.create({
      data: {
        organizationId,
        name: CORRECTIONS_STAGE_NAME,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
      },
    });
  }

  let jobStage = await tx.jobStage.findFirst({
    where: {
      jobId,
      stageId: correctionsStage.id,
    },
  });

  if (!jobStage) {
    const maxJobStageSort = await tx.jobStage.aggregate({
      where: { jobId },
      _max: { sortOrder: true },
    });
    jobStage = await tx.jobStage.create({
      data: {
        jobId,
        stageId: correctionsStage.id,
        title: correctionsStage.name,
        sortOrder: (maxJobStageSort._max.sortOrder ?? 0) + 10,
      },
    });
  }

  return { jobStageId: jobStage.id, correctionsStageId: correctionsStage.id };
}

/**
 * Creates an ACTIVE recovery flow and all recovery tasks atomically.
 * Caller must run inside a transaction and enforce issue/flow preconditions.
 */
export async function materializeRecoveryFlowWithTasksInTx(
  tx: ExtendedTransactionClient,
  input: MaterializeRecoveryFlowInput,
): Promise<MaterializeRecoveryFlowResult> {
  const normalizedTasks = validateRecoveryFlowTasksInput(input.tasks);

  const existingFlow = await tx.jobRecoveryFlow.findUnique({
    where: { jobIssueId: input.jobIssueId },
    select: { id: true, status: true },
  });
  if (existingFlow) {
    if (
      existingFlow.status === JobRecoveryFlowStatus.DRAFT ||
      existingFlow.status === JobRecoveryFlowStatus.ACTIVE
    ) {
      throw new Error(
        "A recovery plan is already in progress for this issue. Open the existing plan instead of creating a duplicate.",
      );
    }
    throw new Error(
      "A recovery path already exists for this issue. Force resolve to cancel it, or contact support if the plan looks incomplete.",
    );
  }

  const issue = await tx.jobIssue.findFirst({
    where: {
      id: input.jobIssueId,
      organizationId: input.organizationId,
      jobId: input.jobId,
    },
    select: { id: true, status: true, jobTaskId: true },
  });
  if (!issue) {
    throw new Error("Job issue not found or access denied.");
  }
  if (issue.status !== JobIssueStatus.OPEN) {
    throw new Error("Only open issues can receive a new recovery path.");
  }

  const { jobStageId } = await ensureCorrectionsJobStageInTx(
    tx,
    input.organizationId,
    input.jobId,
  );

  const sourceFailedTaskId = await resolveRecoveryFlowSourceFailedTaskId({
    tx,
    organizationId: input.organizationId,
    jobId: input.jobId,
    explicitSourceFailedTaskId: input.sourceFailedTaskId,
    issueJobTaskId: issue.jobTaskId,
  });

  const flow = await tx.jobRecoveryFlow.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      jobIssueId: input.jobIssueId,
      status: JobRecoveryFlowStatus.ACTIVE,
      sourceFailedTaskId,
      sourceChecklistItemId: input.sourceChecklistItemId,
      sourcePermitEventId: input.sourcePermitEventId,
      sourceInspectionEventId: input.sourceInspectionEventId,
    },
  });

  const taskIds: string[] = [];
  for (const task of normalizedTasks) {
    const created = await tx.jobTask.create({
      data: {
        jobId: input.jobId,
        jobStageId,
        recoveryFlowId: flow.id,
        recoveryFlowOrder: task.sortOrder!,
        sourceType: LineItemTemplateTaskSource.CUSTOM,
        title: task.title,
        category: task.category,
        instructions: task.instructions,
        status: JobTaskStatus.TODO,
        sortOrder: task.sortOrder!,
        completionRequirementsJson: task.completionRequirementsJson || {},
        providesSignals: task.providesSignals || [],
        requiresSignals: task.requiresSignals || [],
        hardSignal: task.hardSignal || false,
      },
    });
    taskIds.push(created.id);
  }

  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: JobActivityType.RECOVERY_FLOW_CREATED,
      title: `Recovery flow drafted for: ${input.issueTitle}`,
      entityType: "JobRecoveryFlow",
      entityId: flow.id,
      actorUserId: input.actorUserId,
    },
    tx,
  );

  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: JobActivityType.RECOVERY_FLOW_ACTIVATED,
      title: "Recovery flow activated",
      entityType: "JobRecoveryFlow",
      entityId: flow.id,
      actorUserId: input.actorUserId,
    },
    tx,
  );

  return { flowId: flow.id, taskIds };
}
