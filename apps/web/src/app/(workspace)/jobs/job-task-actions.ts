"use server";

import { JobTaskStatus, JobActivityType, JobIssueStatus, JobIssueSeverity, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import {
  deriveTaskState,
  toTaskReadinessInput,
  validateTaskCompletionReadiness,
} from "@/lib/task-readiness";
import { publishSignal, getLiveSignals } from "@/lib/signal-bus";
import { promotePendingPaymentsToDue } from "@/lib/job-payment-readiness";
import { assertCanOverrideTaskReadiness } from "@/lib/job-task-override-guard";

export type JobTaskActionState = {
  error?: string;
  success?: boolean;
};

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
      requiresSignals: task.jobStage.requiresSignals,
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

      // 5. Check if stage is complete and publish stage signals
      const otherTasksInStage = await tx.jobTask.findMany({
        where: { 
          jobStageId: task.jobStageId,
          id: { not: taskId }
        },
        select: { status: true },
      });

      const allOtherTasksDone = otherTasksInStage.every(t => t.status === JobTaskStatus.DONE);
      if (allOtherTasksDone && task.jobStage.providesSignals.length > 0) {
        for (const signalName of task.jobStage.providesSignals) {
          await publishSignal({
            jobId: task.jobId,
            name: signalName,
            sourceJobStageId: task.jobStageId,
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
 * Signal retraction on revert is not implemented in v1.
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
      select: { id: true, jobId: true, status: true },
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

    await db.jobTask.update({
      where: { id: taskId },
      data,
    });

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

      // 3. Check if stage is complete and publish stage signals
      const otherTasksInStage = await tx.jobTask.findMany({
        where: { 
          jobStageId: task.jobStageId,
          id: { not: taskId }
        },
        select: { status: true },
      });

      const allOtherTasksDone = otherTasksInStage.every(t => t.status === JobTaskStatus.DONE);
      if (allOtherTasksDone && task.jobStage.providesSignals.length > 0) {
        for (const signalName of task.jobStage.providesSignals) {
          await publishSignal({
            jobId: task.jobId,
            name: signalName,
            sourceJobStageId: task.jobStageId,
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
      select: { id: true, jobId: true, completionRequirementsJson: true },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
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
