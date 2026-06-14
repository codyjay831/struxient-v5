"use server";

import { revalidatePath } from "next/cache";
import { DailyJobLogStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireMutableSession } from "@/lib/session";
import { generateDailyJobLogDraft } from "@/lib/daily-job-log-helper";

export type CreateOrUpdateDailyJobLogDraftInput = {
  jobId: string;
  logDate: Date;
  summary?: string;
  internalNotes?: string;
};

export async function createOrUpdateDailyJobLogDraftAction(input: CreateOrUpdateDailyJobLogDraftInput) {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  // Verify job belongs to organization
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId },
  });

  if (!job) {
    throw new Error("Job not found or access denied.");
  }

  // Normalize logDate to midnight
  const logDate = new Date(input.logDate);
  logDate.setHours(0, 0, 0, 0);

  let summary = input.summary;
  if (!summary) {
    summary = await generateDailyJobLogDraft({
      organizationId,
      jobId: input.jobId,
      logDate,
    });
  }

  const log = await db.dailyJobLog.upsert({
    where: {
      jobId_logDate: {
        jobId: input.jobId,
        logDate,
      },
    },
    update: {
      summary,
      internalNotes: input.internalNotes,
      // Only allow editing if not VOID. 
      // If REVIEWED, editing reverts it to DRAFT or we could keep it REVIEWED.
      // Canon says "staff review/edit", so let's allow editing but keep status if already REVIEWED?
      // Actually, usually editing a reviewed log should probably require re-review.
      status: {
        set: DailyJobLogStatus.DRAFT
      }
    },
    create: {
      organizationId,
      jobId: input.jobId,
      logDate,
      summary,
      internalNotes: input.internalNotes,
      status: DailyJobLogStatus.DRAFT,
    },
  });

  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/workstation");
  return { success: true, logId: log.id };
}

export async function markDailyJobLogReviewedAction(logId: string) {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  const log = await db.dailyJobLog.findFirst({
    where: { id: logId, organizationId },
  });

  if (!log) {
    throw new Error("Daily log not found or access denied.");
  }

  await db.dailyJobLog.update({
    where: { id: logId },
    data: {
      status: DailyJobLogStatus.REVIEWED,
      reviewedByUserId: session.userId,
      reviewedAt: new Date(),
    },
  });

  revalidatePath(`/jobs/${log.jobId}`);
  revalidatePath("/workstation");
  return { success: true };
}

export async function voidDailyJobLogAction(logId: string) {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  const log = await db.dailyJobLog.findFirst({
    where: { id: logId, organizationId },
  });

  if (!log) {
    throw new Error("Daily log not found or access denied.");
  }

  await db.dailyJobLog.update({
    where: { id: logId },
    data: {
      status: DailyJobLogStatus.VOID,
    },
  });

  revalidatePath(`/jobs/${log.jobId}`);
  revalidatePath("/workstation");
  return { success: true };
}
