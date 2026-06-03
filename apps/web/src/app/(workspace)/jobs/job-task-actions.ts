"use server";

import {
  JobTaskStatus,
  JobActivityType,
  JobIssueStatus,
  JobIssueSeverity,
  JobStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import {
  deriveTaskState,
  toTaskReadinessInput,
  validateTaskCompletionReadiness,
  type TaskCompletionRequirements,
} from "@/lib/task-readiness";
import { publishSignal, getLiveSignals, retractSignal } from "@/lib/signal-bus";
import { promotePendingPaymentsToDue } from "@/lib/job-payment-readiness";
import { assertCanOverrideTaskReadiness } from "@/lib/job-task-override-guard";
import { assertCanToggleTaskChecklistItem } from "@/lib/job-task-checklist-guard";
import { assertCanRevertJobTaskToTodo } from "@/lib/job-task-revert";
import {
  computeNextTaskSortOrder,
  validateAddJobTaskInput,
  type AddJobTaskInput,
} from "@/lib/job-task-add-guard";

export type JobTaskActionState = {
  error?: string;
  success?: boolean;
  taskId?: string;
};

export async function addJobTaskAction(
  input: AddJobTaskInput,
): Promise<JobTaskActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const jobStage = await db.jobStage.findFirst({
      where: {
        id: input.jobStageId.trim(),
        jobId: input.jobId.trim(),
        job: { organizationId },
      },
      select: {
        id: true,
        title: true,
        jobId: true,
        job: { select: { id: true, status: true } },
      },
    });

    if (!jobStage) {
      return { error: "Job or stage not found in your organization." };
    }

    const validation = validateAddJobTaskInput(input, {
      jobId: jobStage.jobId,
      jobStageId: jobStage.id,
      stageTitle: jobStage.title,
      stageBelongsToJob: true,
      jobIsActive: jobStage.job.status === JobStatus.ACTIVE,
    });

    if (!validation.ok) {
      return { error: validation.error };
    }

    const maxSort = await db.jobTask.aggregate({
      where: { jobStageId: jobStage.id },
      _max: { sortOrder: true },
    });

    const sortOrder = computeNextTaskSortOrder(maxSort._max.sortOrder);

    const task = await db.$transaction(async (tx) => {
      const created = await tx.jobTask.create({
        data: {
          jobId: jobStage.jobId,
          jobStageId: jobStage.id,
          sourceType: LineItemTemplateTaskSource.CUSTOM,
          title: validation.title,
          instructions: validation.instructions,
          category: TaskTemplateCategory.GENERAL,
          status: JobTaskStatus.TODO,
          sortOrder,
          completionRequirementsJson: {},
          providesSignals: [],
          requiresSignals: [],
          hardSignal: false,
        },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: jobStage.jobId,
          type: JobActivityType.ISSUE_FOLLOW_UP_TASK_CREATED,
          title: `Task added: ${validation.title}`,
          details: validation.instructions
            ? `Added to ${jobStage.title}. ${validation.instructions}`
            : `Added to ${jobStage.title}.`,
          entityType: "JobTask",
          entityId: created.id,
          actorUserId: session.userId,
          metadataJson: {
            activityKind: "TASK_ADDED",
            jobStageId: jobStage.id,
            stageTitle: jobStage.title,
          },
        },
        tx,
      );

      return created;
    });

    revalidatePath("/workstation");
    revalidatePath("/workstation/tasks");
    revalidatePath(`/jobs/${jobStage.jobId}`);

    return { success: true, taskId: task.id };
  } catch (e) {
    console.error("Failed to add job task", e);
    return { error: "Failed to add task. Please try again." };
  }
}

export async function completeJobTaskAction(
  taskId: string,
  completionNote?: string,
): Promise<JobTaskActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      include: {
        jobStage: {
          include: {
            issues: {
              where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
              select: { id: true, status: true, severity: true },
            },
          },
        },
        attachments: { 
          where: { status: "READY" },
          select: { id: true } 
        },
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
          select: { id: true, status: true, severity: true },
        },
        recoveryFlow: {
          select: { jobIssueId: true }
        }
      },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    if (task.status === JobTaskStatus.DONE) {
      return { error: "Task is already completed." };
    }

    // 1. Check readiness using Signal Bus
    const liveSignals = await getLiveSignals(task.jobId);
    const readinessInput = toTaskReadinessInput(task, {
      requiresSignals: [],
      issues: task.jobStage.issues,
    });
    const state = deriveTaskState(readinessInput, liveSignals, {
      recoveryFlowIssueId: task.recoveryFlow?.jobIssueId,
    });

    if (state === "BLOCKED_BY_ISSUE") {
      return { error: "Task is blocked by an open issue." };
    }
    if (state === "BLOCKED_BY_SIGNAL") {
      return { error: "Task is waiting on a signal." };
    }

    const proofCheck = validateTaskCompletionReadiness({
      completionNote: completionNote?.trim() || task.completionNote,
      completionRequirementsJson: task.completionRequirementsJson,
      attachments: task.attachments,
    });
    if (!proofCheck.ok) {
      return { error: proofCheck.error };
    }

    await db.$transaction(async (tx) => {
      // 3. Mark task as DONE
      await tx.jobTask.update({
        where: { id: taskId },
        data: {
          status: JobTaskStatus.DONE,
          completedAt: new Date(),
          completedByUserId: session.userId,
          completionNote: completionNote?.trim() || null,
        },
      });

      // 4. Publish task signals
      if (task.providesSignals.length > 0) {
        for (const signalName of task.providesSignals) {
          await publishSignal({
            jobId: task.jobId,
            name: signalName,
            sourceJobTaskId: task.id,
          });
        }
      }

      await recordJobActivity(
        {
          organizationId,
          jobId: task.jobId,
          type: JobActivityType.TASK_COMPLETED,
          title: `Task completed: ${task.title}`,
          details: completionNote?.trim() || undefined,
          entityType: "JobTask",
          entityId: task.id,
          actorUserId: session.userId,
        },
        tx
      );

      await promotePendingPaymentsToDue(task.jobId, tx);
    });

    revalidatePath("/workstation");
    revalidatePath("/workstation/tasks");
    revalidatePath(`/jobs/${task.jobId}`);

    return { success: true };
  } catch (e) {
    console.error("Failed to complete task", e);
    return { error: "Failed to complete task. Please try again." };
  }
}

/**
 * @internal Prefer completeJobTaskAction for marking tasks DONE.
 * Reverting DONE → TODO retracts task-sourced signals when safe (see job-task-revert).
 */
export async function updateJobTaskStatusAction(
  taskId: string,
  status: JobTaskStatus,
): Promise<JobTaskActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  if (status === JobTaskStatus.DONE) {
    return {
      error: "Use the complete task action to mark a task done with proper readiness checks.",
    };
  }

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      select: { id: true, jobId: true, status: true, providesSignals: true },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    const data =
      status === JobTaskStatus.TODO
        ? {
            status: JobTaskStatus.TODO,
            completedAt: null,
            completedByUserId: null,
            completionNote: null,
          }
        : { status };

    const isRevertFromDone =
      status === JobTaskStatus.TODO && task.status === JobTaskStatus.DONE;

    if (isRevertFromDone) {
      const jobSignals =
        task.providesSignals.length > 0
          ? await db.jobSignal.findMany({
              where: {
                jobId: task.jobId,
                name: { in: task.providesSignals },
              },
              select: { name: true, sourceJobTaskId: true },
            })
          : [];

      const downstreamDoneTasks = await db.jobTask.findMany({
        where: {
          jobId: task.jobId,
          id: { not: taskId },
          status: JobTaskStatus.DONE,
        },
        select: { id: true, requiresSignals: true },
      });

      const revertGate = assertCanRevertJobTaskToTodo({
        currentStatus: task.status,
        taskId: task.id,
        providesSignals: task.providesSignals,
        jobSignals,
        downstreamDoneTasks,
      });

      if (!revertGate.ok) {
        return { error: revertGate.error };
      }

      await db.$transaction(async (tx) => {
        await tx.jobTask.update({
          where: { id: taskId },
          data,
        });

        for (const signalName of revertGate.signalNamesToRetract) {
          await retractSignal({ jobId: task.jobId, name: signalName, tx });
        }
      });
    } else {
      await db.jobTask.update({
        where: { id: taskId },
        data,
      });
    }

    revalidatePath("/workstation");
    revalidatePath("/workstation/tasks");
    revalidatePath(`/jobs/${task.jobId}`);

    return {};
  } catch (e) {
    console.error("Failed to update task status", e);
    return { error: "Failed to update task status. Please try again." };
  }
}

export async function overrideJobTaskReadinessAction(
  taskId: string,
  completionNote?: string,
): Promise<JobTaskActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      include: {
        jobStage: {
          include: {
            issues: {
              where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
              select: { id: true, status: true, severity: true },
            },
          },
        },
        attachments: {
          where: { status: "READY" },
          select: { id: true },
        },
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
          select: { id: true, status: true, severity: true },
        },
      },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    const overrideGate = assertCanOverrideTaskReadiness(task);
    if (!overrideGate.ok) {
      return { error: overrideGate.error };
    }

    await db.$transaction(async (tx) => {
      // 1. Mark task as DONE (ignoring readiness)
      await tx.jobTask.update({
        where: { id: taskId },
        data: {
          status: JobTaskStatus.DONE,
          completedAt: new Date(),
          completedByUserId: session.userId,
          completionNote: completionNote?.trim() || "MANAGER OVERRIDE",
        },
      });

      // 2. Publish task signals
      if (task.providesSignals.length > 0) {
        for (const signalName of task.providesSignals) {
          await publishSignal({
            jobId: task.jobId,
            name: signalName,
            sourceJobTaskId: task.id,
          });
        }
      }

      await recordJobActivity(
        {
          organizationId,
          jobId: task.jobId,
          type: JobActivityType.TASK_COMPLETED,
          title: `Task completed (OVERRIDE): ${task.title}`,
          details: completionNote?.trim() || "Manager override used to bypass readiness blockers.",
          entityType: "JobTask",
          entityId: task.id,
          actorUserId: session.userId,
          metadataJson: { forced: true, override: true },
        },
        tx
      );

      await promotePendingPaymentsToDue(task.jobId, tx);
    });

    revalidatePath("/workstation");
    revalidatePath("/workstation/tasks");
    revalidatePath(`/jobs/${task.jobId}`);

    return { success: true };
  } catch (e) {
    console.error("Failed to override task", e);
    return { error: "Failed to override task. Please try again." };
  }
}

export async function toggleJobTaskChecklistItemAction(
  taskId: string,
  checklistItemId: string,
  completed: boolean,
): Promise<JobTaskActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      select: {
        id: true,
        jobId: true,
        status: true,
        completedAt: true,
        completionNote: true,
        completionRequirementsJson: true,
        requiresSignals: true,
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
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    const liveSignals = await getLiveSignals(task.jobId);
    const toggleGate = assertCanToggleTaskChecklistItem({
      status: task.status,
      completedAt: task.completedAt,
      completionNote: task.completionNote,
      completionRequirementsJson: task.completionRequirementsJson,
      requiresSignals: task.requiresSignals,
      issues: task.issues,
      jobStage: task.jobStage,
      recoveryFlowIssueId: task.recoveryFlow?.jobIssueId,
      liveSignals,
      completed,
    });
    if (!toggleGate.ok) {
      return { error: toggleGate.error };
    }

    const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
    if (!requirements.checklist) {
      return { error: "Checklist not found for this task." };
    }

    const newChecklist = requirements.checklist.map((item) => {
      if (item.id === checklistItemId) {
        return {
          ...item,
          completedAt: completed ? new Date().toISOString() : null,
          completedByUserId: completed ? session.userId : null,
        };
      }
      return item;
    });

    await db.jobTask.update({
      where: { id: taskId },
      data: {
        completionRequirementsJson: {
          ...requirements,
          checklist: newChecklist,
        } as Prisma.InputJsonValue,
      },
    });

    revalidatePath("/workstation");
    revalidatePath("/workstation/tasks");
    revalidatePath(`/jobs/${task.jobId}`);

    return { success: true };
  } catch (e) {
    console.error("Failed to toggle checklist item", e);
    return { error: "Failed to update checklist. Please try again." };
  }
}
