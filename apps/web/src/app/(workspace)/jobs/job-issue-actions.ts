"use server";

import { revalidatePath } from "next/cache";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobTaskStatus,
  LineItemTemplateTaskSource,
  TaskTemplateCategory,
  JobActivityType,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";

const CORRECTIONS_STAGE_NAME = "Corrections";

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
  const session = await requireCurrentSession();
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
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  // Verify issue belongs to organization
  const issue = await db.jobIssue.findFirst({
    where: { id: input.issueId, organizationId },
  });

  if (!issue) {
    throw new Error("Issue not found or access denied.");
  }

  await db.jobIssue.update({
    where: { id: input.issueId },
    data: {
      status: JobIssueStatus.RESOLVED,
      resolutionNote: input.resolutionNote,
      resolvedAt: new Date(),
    },
  });

  await recordJobActivity({
    organizationId,
    jobId: issue.jobId,
    type: JobActivityType.ISSUE_RESOLVED,
    title: `Issue resolved: ${issue.title}`,
    details: input.resolutionNote,
    entityType: "JobIssue",
    entityId: issue.id,
    actorUserId: session.userId,
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

export async function createFollowUpTaskFromIssueAction(input: CreateFollowUpTaskInput) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  // Verify issue belongs to organization and is OPEN
  const issue = await db.jobIssue.findFirst({
    where: { id: input.issueId, organizationId },
    include: { followUpTasks: true },
  });

  if (!issue) {
    throw new Error("Issue not found or access denied.");
  }

  if (issue.status !== JobIssueStatus.OPEN) {
    throw new Error("Cannot create follow-up for a resolved or cancelled issue.");
  }

  if (issue.followUpTasks.length > 0) {
    throw new Error("A follow-up task already exists for this issue.");
  }

  // Resolve a "Corrections" Stage row for this org; create one if missing so
  // follow-up tasks always have a place to land.
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

  // Find or create the corrections JobStage on this job, anchored to the org stage.
  let jobStage = await db.jobStage.findFirst({
    where: {
      jobId: issue.jobId,
      stageId: correctionsStage.id,
    },
  });
  if (!jobStage) {
    const maxJobStageSort = await db.jobStage.aggregate({
      where: { jobId: issue.jobId },
      _max: { sortOrder: true },
    });
    jobStage = await db.jobStage.create({
      data: {
        jobId: issue.jobId,
        stageId: correctionsStage.id,
        title: correctionsStage.name,
        sortOrder: (maxJobStageSort._max.sortOrder ?? 0) + 10,
      },
    });
  }

  // Create the follow-up task
  const task = await db.jobTask.create({
    data: {
      jobId: issue.jobId,
      jobStageId: jobStage.id,
      sourceJobIssueId: issue.id,
      sourceType: LineItemTemplateTaskSource.CUSTOM,
      title: input.title,
      category: TaskTemplateCategory.GENERAL,
      stageId: correctionsStage.id,
      instructions: input.instructions,
      status: JobTaskStatus.TODO,
      sortOrder: 0,
    },
  });

  await recordJobActivity({
    organizationId,
    jobId: issue.jobId,
    type: JobActivityType.ISSUE_FOLLOW_UP_TASK_CREATED,
    title: `Follow-up task created: ${input.title}`,
    details: input.instructions,
    entityType: "JobTask",
    entityId: task.id,
    actorUserId: session.userId,
    metadataJson: {
      issueId: issue.id,
      issueTitle: issue.title,
    },
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${issue.jobId}`);

  return { success: true, taskId: task.id };
}
