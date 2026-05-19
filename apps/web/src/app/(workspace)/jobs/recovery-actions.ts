"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  JobRecoveryFlowStatus,
  JobTaskStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
  JobActivityType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { resolveJobIssueWithRecoveryHandling } from "@/lib/resolve-job-issue-core";
import {
  materializeRecoveryFlowWithTasksInTx,
  validateRecoveryFlowTasksInput,
} from "@/lib/recovery-flow-materialize";
import type { RecoveryFlowTaskInput } from "@/lib/recovery-flow-materialize";
import { AIService } from "@/lib/ai/ai-service";

const CORRECTIONS_STAGE_NAME = "Corrections";

export type CreateRecoveryFlowInput = {
  jobIssueId: string;
  sourceFailedTaskId?: string;
  sourceChecklistItemId?: string;
  sourcePermitEventId?: string;
  sourceInspectionEventId?: string;
};

export type CreateAndActivateRecoveryFlowInput = {
  jobIssueId: string;
  tasks: RecoveryFlowTaskInput[];
  sourceFailedTaskId?: string;
  sourceChecklistItemId?: string;
  sourcePermitEventId?: string;
  sourceInspectionEventId?: string;
};

/**
 * Creates an ACTIVE recovery flow and all recovery tasks in one transaction.
 * Preferred path for initial recovery plan submission from the UI.
 */
export async function createAndActivateRecoveryFlowWithTasksAction(
  input: CreateAndActivateRecoveryFlowInput,
) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const normalizedTasks = validateRecoveryFlowTasksInput(input.tasks);

  const issue = await db.jobIssue.findFirst({
    where: { id: input.jobIssueId, organizationId },
    select: { id: true, jobId: true, title: true },
  });

  if (!issue) {
    throw new Error("Job issue not found or access denied.");
  }

  try {
    const result = await db.$transaction(async (tx) =>
      materializeRecoveryFlowWithTasksInTx(tx, {
        organizationId,
        jobIssueId: input.jobIssueId,
        jobId: issue.jobId,
        issueTitle: issue.title,
        tasks: normalizedTasks,
        actorUserId: session.userId,
        sourceFailedTaskId: input.sourceFailedTaskId,
        sourceChecklistItemId: input.sourceChecklistItemId,
        sourcePermitEventId: input.sourcePermitEventId,
        sourceInspectionEventId: input.sourceInspectionEventId,
      }),
    );

    revalidatePath(`/jobs/${issue.jobId}`);
    revalidatePath("/workstation");
    return { success: true as const, flowId: result.flowId, taskIds: result.taskIds };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error(
        "A recovery path already exists for this issue. Refresh the page and try again.",
      );
    }
    throw e;
  }
}

/**
 * Creates a new recovery flow for a given job issue.
 * The flow starts in DRAFT status.
 * Do not compose with addRecoveryTaskAction for UI submit — use createAndActivateRecoveryFlowWithTasksAction.
 */
export async function createRecoveryFlowAction(input: CreateRecoveryFlowInput) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  // Verify issue belongs to organization
  const issue = await db.jobIssue.findFirst({
    where: { id: input.jobIssueId, organizationId },
  });

  if (!issue) {
    throw new Error("Job issue not found or access denied.");
  }

  // Check if a flow already exists for this issue
  const existingFlow = await db.jobRecoveryFlow.findUnique({
    where: { jobIssueId: input.jobIssueId },
  });

  if (existingFlow) {
    return { success: true, flowId: existingFlow.id };
  }

  const flow = await db.jobRecoveryFlow.create({
    data: {
      organizationId,
      jobId: issue.jobId,
      jobIssueId: input.jobIssueId,
      status: JobRecoveryFlowStatus.DRAFT,
      sourceFailedTaskId: input.sourceFailedTaskId,
      sourceChecklistItemId: input.sourceChecklistItemId,
      sourcePermitEventId: input.sourcePermitEventId,
      sourceInspectionEventId: input.sourceInspectionEventId,
    },
  });

  await recordJobActivity({
    organizationId,
    jobId: issue.jobId,
    type: JobActivityType.RECOVERY_FLOW_CREATED,
    title: `Recovery flow drafted for: ${issue.title}`,
    entityType: "JobRecoveryFlow",
    entityId: flow.id,
    actorUserId: session.userId,
  });

  revalidatePath(`/jobs/${issue.jobId}`);
  return { success: true, flowId: flow.id };
}

export type AddRecoveryTaskInput = {
  flowId: string;
  title: string;
  category: TaskTemplateCategory;
  instructions?: string;
  sortOrder?: number;
  completionRequirementsJson?: unknown;
  providesSignals?: string[];
  requiresSignals?: string[];
  hardSignal?: boolean;
};

/**
 * Adds a task to a recovery flow.
 * Not used for initial recovery path creation from the UI.
 */
export async function addRecoveryTaskAction(input: AddRecoveryTaskInput) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const flow = await db.jobRecoveryFlow.findFirst({
    where: { id: input.flowId, organizationId },
    include: { jobIssue: true },
  });

  if (!flow) {
    throw new Error("Recovery flow not found or access denied.");
  }

  // Find or create the "Corrections" stage
  let correctionsStage = await db.stage.findFirst({
    where: {
      organizationId,
      name: CORRECTIONS_STAGE_NAME,
      archivedAt: null,
    },
  });

  if (!correctionsStage) {
    const maxSort = await db.stage.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    correctionsStage = await db.stage.create({
      data: {
        organizationId,
        name: CORRECTIONS_STAGE_NAME,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
      },
    });
  }

  // Find or create the corrections JobStage on this job
  let jobStage = await db.jobStage.findFirst({
    where: {
      jobId: flow.jobId,
      stageId: correctionsStage.id,
    },
  });

  if (!jobStage) {
    const maxJobStageSort = await db.jobStage.aggregate({
      where: { jobId: flow.jobId },
      _max: { sortOrder: true },
    });
    jobStage = await db.jobStage.create({
      data: {
        jobId: flow.jobId,
        stageId: correctionsStage.id,
        title: correctionsStage.name,
        sortOrder: (maxJobStageSort._max.sortOrder ?? 0) + 10,
      },
    });
  }

  const task = await db.jobTask.create({
    data: {
      jobId: flow.jobId,
      jobStageId: jobStage.id,
      recoveryFlowId: flow.id,
      recoveryFlowOrder: input.sortOrder ?? 0,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
      title: input.title,
      category: input.category,
      instructions: input.instructions,
      status: JobTaskStatus.TODO,
      sortOrder: input.sortOrder ?? 0,
      completionRequirementsJson: input.completionRequirementsJson || {},
      providesSignals: input.providesSignals || [],
      requiresSignals: input.requiresSignals || [],
      hardSignal: input.hardSignal || false,
    },
  });

  revalidatePath(`/jobs/${flow.jobId}`);
  return { success: true, taskId: task.id };
}

/**
 * Activates a recovery flow, moving it from DRAFT to ACTIVE.
 * Not used for initial recovery path creation from the UI.
 */
export async function activateRecoveryFlowAction(flowId: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const flow = await db.jobRecoveryFlow.findFirst({
    where: { id: flowId, organizationId },
  });

  if (!flow) {
    throw new Error("Recovery flow not found or access denied.");
  }

  await db.jobRecoveryFlow.update({
    where: { id: flowId },
    data: { status: JobRecoveryFlowStatus.ACTIVE },
  });

  await recordJobActivity({
    organizationId,
    jobId: flow.jobId,
    type: JobActivityType.RECOVERY_FLOW_ACTIVATED,
    title: `Recovery flow activated`,
    entityType: "JobRecoveryFlow",
    entityId: flow.id,
    actorUserId: session.userId,
  });

  revalidatePath(`/jobs/${flow.jobId}`);
  revalidatePath("/workstation");
  return { success: true };
}

/**
 * Resolves the issue and marks the recovery flow as COMPLETED.
 * This unmutes the original path.
 */
export async function resolveIssueAndResumeAction(jobIssueId: string, resolutionNote?: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const issue = await db.jobIssue.findFirst({
    where: { id: jobIssueId, organizationId },
    include: {
      recoveryFlow: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!issue) {
    throw new Error("Job issue not found or access denied.");
  }

  try {
    await db.$transaction(async (tx) => {
      await resolveJobIssueWithRecoveryHandling(tx, {
        organizationId,
        issue,
        resolutionNote,
        mode: "resume",
        actorUserId: session.userId,
      });
    });
  } catch (e) {
    throw e instanceof Error ? e : new Error("Failed to resume job path.");
  }

  revalidatePath(`/jobs/${issue.jobId}`);
  revalidatePath("/workstation");
  return { success: true };
}

export async function suggestRecoveryPathAction(jobIssueId: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const issue = await db.jobIssue.findFirst({
    where: { id: jobIssueId, organizationId },
    include: {
      job: {
        select: {
          title: true,
          organization: { select: { name: true } },
          stages: {
            orderBy: { sortOrder: "asc" },
            select: {
              title: true,
              tasks: {
                orderBy: { sortOrder: "asc" },
                select: {
                  title: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      jobTask: {
        select: {
          title: true,
          category: true,
          instructions: true,
        },
      },
    },
  });

  if (!issue) {
    throw new Error("Job issue not found or access denied.");
  }

  const ai = new AIService();
  const proposal = await ai.suggestRecoveryPath({
    issue: {
      id: issue.id,
      title: issue.title,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
    },
    blockedTask: issue.jobTask,
    jobContext: {
      title: issue.job.title,
      organizationName: issue.job.organization.name,
      stages: issue.job.stages,
    },
  });

  return { proposal };
}
