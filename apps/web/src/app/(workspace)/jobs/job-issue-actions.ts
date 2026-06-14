"use server";

import { revalidatePath } from "next/cache";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobActivityType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireMutableSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { resolveJobIssueWithRecoveryHandling } from "@/lib/resolve-job-issue-core";

export type CreateJobIssueInput = {
  jobId: string;
  jobStageId?: string;
  jobTaskId?: string;
  type: JobIssueType;
  severity?: JobIssueSeverity;
  title: string;
  description?: string;
};

export async function createJobIssueAction(input: CreateJobIssueInput) {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  // Verify job belongs to organization
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId },
  });

  if (!job) {
    throw new Error("Job not found or access denied.");
  }

  // Verify stage belongs to job if provided
  if (input.jobStageId) {
    const stage = await db.jobStage.findFirst({
      where: { id: input.jobStageId, jobId: input.jobId },
    });
    if (!stage) {
      throw new Error("Job stage not found or does not belong to this job.");
    }
  }

  // Verify task belongs to job if provided
  if (input.jobTaskId) {
    const task = await db.jobTask.findFirst({
      where: { id: input.jobTaskId, jobId: input.jobId },
    });
    if (!task) {
      throw new Error("Job task not found or does not belong to this job.");
    }
  }

  const issue = await db.jobIssue.create({
    data: {
      organizationId,
      jobId: input.jobId,
      jobStageId: input.jobStageId,
      jobTaskId: input.jobTaskId,
      createdByUserId: session.userId,
      type: input.type,
      severity: input.severity ?? JobIssueSeverity.BLOCKS_WORK,
      status: JobIssueStatus.OPEN,
      title: input.title,
      description: input.description,
    },
  });

  await recordJobActivity({
    organizationId,
    jobId: input.jobId,
    type: JobActivityType.ISSUE_CREATED,
    title: `Issue created: ${input.title}`,
    details: input.description,
    entityType: "JobIssue",
    entityId: issue.id,
    actorUserId: session.userId,
    metadataJson: {
      type: input.type,
      severity: input.severity ?? JobIssueSeverity.BLOCKS_WORK,
    },
  });

  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
  revalidatePath(`/jobs/${input.jobId}`);

  return { success: true, issueId: issue.id };
}

export type ResolveJobIssueInput = {
  issueId: string;
  resolutionNote?: string;
};

export async function resolveJobIssueAction(input: ResolveJobIssueInput) {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  const issue = await db.jobIssue.findFirst({
    where: { id: input.issueId, organizationId },
    include: {
      recoveryFlow: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!issue) {
    throw new Error("Issue not found or access denied.");
  }

  try {
    await db.$transaction(async (tx) => {
      await resolveJobIssueWithRecoveryHandling(tx, {
        organizationId,
        issue,
        resolutionNote: input.resolutionNote,
        mode: "standard",
        actorUserId: session.userId,
      });
    });
  } catch (e) {
    throw e instanceof Error ? e : new Error("Failed to resolve issue.");
  }

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${issue.jobId}`);

  return { success: true };
}

export async function forceResolveJobIssueAction(input: ResolveJobIssueInput) {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  const issue = await db.jobIssue.findFirst({
    where: { id: input.issueId, organizationId },
    include: {
      recoveryFlow: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!issue) {
    throw new Error("Issue not found or access denied.");
  }

  await db.$transaction(async (tx) => {
    await resolveJobIssueWithRecoveryHandling(tx, {
      organizationId,
      issue,
      resolutionNote: input.resolutionNote,
      mode: "force",
      actorUserId: session.userId,
    });
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${issue.jobId}`);

  return { success: true };
}

export type CreateFollowUpTaskInput = {
  issueId: string;
  title: string;
  instructions?: string;
};

/**
 * @deprecated Blocking issue mitigation is RecoveryFlow-only in v5 canon.
 * Use createRecoveryFlowAction + addRecoveryTaskAction instead.
 */
export async function createFollowUpTaskFromIssueAction(input: CreateFollowUpTaskInput) {
  void input;
  throw new Error(
    "Follow-up issue tasks are deprecated. Use Create Recovery Path for BLOCKS_WORK issues.",
  );
}
