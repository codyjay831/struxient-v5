"use server";

import { revalidatePath } from "next/cache";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobActivityType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { resolveJobIssueWithRecoveryHandling } from "@/lib/resolve-job-issue-core";
import { authorizeStaffAction, STAFF_ACTIONS } from "@/lib/authz/staff-actions";

export type CreateJobIssueInput = {
  jobId: string;
  jobStageId?: string;
  jobTaskId?: string;
  type: JobIssueType;
  severity?: JobIssueSeverity;
  title: string;
  description?: string;
};

export type JobIssueActionState = {
  error?: string;
  success?: boolean;
  issueId?: string;
};

export async function createJobIssueAction(
  input: CreateJobIssueInput,
): Promise<JobIssueActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;
  const jobId = input.jobId.trim();
  const jobTaskId = input.jobTaskId?.trim();

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.ISSUE_CREATE,
    resourceType: jobTaskId ? "jobTask" : "job",
    resourceId: jobTaskId ?? jobId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
    });

    if (!job) {
      return { error: "Job not found or access denied." };
    }

    if (input.jobStageId) {
      const stage = await db.jobStage.findFirst({
        where: { id: input.jobStageId, jobId },
      });
      if (!stage) {
        return { error: "Job stage not found or does not belong to this job." };
      }
    }

    if (jobTaskId) {
      const task = await db.jobTask.findFirst({
        where: { id: jobTaskId, jobId },
      });
      if (!task) {
        return { error: "Job task not found or does not belong to this job." };
      }
    }

    const issue = await db.jobIssue.create({
      data: {
        organizationId,
        jobId,
        jobStageId: input.jobStageId,
        jobTaskId,
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
      jobId,
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
    revalidatePath(`/jobs/${jobId}`);

    return { success: true, issueId: issue.id };
  } catch (e) {
    console.error("Failed to create job issue", e);
    return { error: "Failed to create issue. Please try again." };
  }
}

export type ResolveJobIssueInput = {
  issueId: string;
  resolutionNote?: string;
};

export async function resolveJobIssueAction(
  input: ResolveJobIssueInput,
): Promise<JobIssueActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.ISSUE_RESOLVE,
    resourceType: "jobIssue",
    resourceId: input.issueId.trim(),
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const issue = await db.jobIssue.findFirst({
    where: { id: input.issueId.trim(), organizationId },
    include: {
      recoveryFlow: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!issue) {
    return { error: "Issue not found or access denied." };
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
    return {
      error: e instanceof Error ? e.message : "Failed to resolve issue.",
    };
  }

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${issue.jobId}`);

  return { success: true };
}

export async function forceResolveJobIssueAction(
  input: ResolveJobIssueInput,
): Promise<JobIssueActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.ISSUE_FORCE_RESOLVE,
    resourceType: "jobIssue",
    resourceId: input.issueId.trim(),
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const issue = await db.jobIssue.findFirst({
    where: { id: input.issueId.trim(), organizationId },
    include: {
      recoveryFlow: {
        include: {
          tasks: { select: { id: true, status: true } },
        },
      },
    },
  });

  if (!issue) {
    return { error: "Issue not found or access denied." };
  }

  try {
    await db.$transaction(async (tx) => {
      await resolveJobIssueWithRecoveryHandling(tx, {
        organizationId,
        issue,
        resolutionNote: input.resolutionNote,
        mode: "force",
        actorUserId: session.userId,
      });
    });
  } catch (e) {
    console.error("Failed to force resolve job issue", e);
    return { error: "Failed to force resolve issue. Please try again." };
  }

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
