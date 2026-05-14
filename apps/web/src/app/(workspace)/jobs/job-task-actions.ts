"use server";

import { JobTaskStatus, JobActivityType, JobIssueStatus, JobIssueSeverity } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { deriveTaskState, type TaskCompletionRequirements } from "@/lib/task-readiness";
import { publishSignal, getLiveSignals } from "@/lib/signal-bus";

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
            },
          },
        },
        attachments: { 
          where: { status: "READY" },
          select: { id: true } 
        },
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
        },
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
    const state = deriveTaskState(task, liveSignals);

    if (state === "BLOCKED_BY_ISSUE") {
      return { error: "Task is blocked by an open issue." };
    }
    if (state === "BLOCKED_BY_SIGNAL") {
      return { error: "Task is waiting on a signal." };
    }

    // 2. Validate requirements
    const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
    if (requirements.noteRequired && !completionNote?.trim()) {
      return { error: "A completion note is required for this task." };
    }

    if ((requirements.photoRequired || requirements.attachmentRequired) && task.attachments.length === 0) {
      return { error: "Photo or attachment proof is required for this task." };
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

export async function updateJobTaskStatusAction(
  taskId: string,
  status: JobTaskStatus,
): Promise<JobTaskActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId } },
      select: { id: true, jobId: true },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    // Note: If reverting from DONE to TODO, we might need to retract signals.
    // For V1, we'll assume completion is a one-way street or handle retraction explicitly.
    // Retracting signals is complex because it might re-block many things.
    
    await db.jobTask.update({
      where: { id: taskId },
      data: { status },
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
        jobStage: true,
        attachments: { 
          where: { status: "READY" },
          select: { id: true } 
        },
      },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    if (task.status === JobTaskStatus.DONE) {
      return { error: "Task is already completed." };
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
