"use server";

import { JobTaskStatus, JobActivityType, JobIssueStatus, JobIssueSeverity, JobPaymentRequirementStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { deriveTaskState, type TaskCompletionRequirements } from "@/lib/task-readiness";

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
        jobStage: true,
        attachments: { 
          where: { status: "READY" },
          select: { id: true } 
        },
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
        },
        job: {
          include: {
            paymentRequirements: {
              where: { status: JobPaymentRequirementStatus.DUE },
              include: {
                requiredBeforeStage: { select: { sortOrder: true } },
              },
            },
          },
        },
      },
    });

    if (!task) {
      return { error: "Task not found in your organization." };
    }

    if (task.completedAt) {
      return { error: "Task is already completed." };
    }

    // Validate blockers
    if (task.issues.length > 0) {
      return { error: "Task is blocked by an open issue." };
    }

    // Validate payment gates
    const paymentBlockers = task.job.paymentRequirements.filter((p) => {
      // Job-level gate (no stage linked) blocks everything
      if (p.requiredBeforeStageId === null) return true;

      // Stage-level gate blocks its stage and all subsequent stages
      if (p.requiredBeforeStage) {
        return task.jobStage.sortOrder >= p.requiredBeforeStage.sortOrder;
      }

      return false;
    });

    if (paymentBlockers.length > 0) {
      return { error: `Task is blocked by unpaid payment: ${paymentBlockers[0].title}` };
    }

    // Validate requirements
    const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
    if (requirements.noteRequired && !completionNote?.trim()) {
      return { error: "A completion note is required for this task." };
    }

    if ((requirements.photoRequired || requirements.attachmentRequired) && task.attachments.length === 0) {
      return { error: "Photo or attachment proof is required for this task." };
    }

    await db.$transaction(async (tx) => {
      await tx.jobTask.update({
        where: { id: taskId },
        data: {
          status: JobTaskStatus.DONE,
          completedAt: new Date(),
          completedByUserId: session.userId,
          completionNote: completionNote?.trim() || null,
        },
      });

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
