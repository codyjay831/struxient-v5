"use server";

import { revalidatePath } from "next/cache";
import { DailyJobLogStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { generateDailyJobLogDraft } from "@/lib/daily-job-log-helper";
import { authorizeStaffAction, STAFF_ACTIONS } from "@/lib/authz/staff-actions";
import { canWriteDailyLogInternalNotes } from "@/lib/authz/daily-log-visibility";

export type CreateOrUpdateDailyJobLogDraftInput = {
  jobId: string;
  logDate: Date;
  summary?: string;
  internalNotes?: string;
};

export type DailyLogActionState = {
  error?: string;
  success?: boolean;
  logId?: string;
};

export async function createOrUpdateDailyJobLogDraftAction(
  input: CreateOrUpdateDailyJobLogDraftInput,
): Promise<DailyLogActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;
  const includesInternalNotes = Boolean(input.internalNotes?.trim());

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.DAILY_LOG_DRAFT_UPSERT,
    resourceType: "job",
    resourceId: input.jobId.trim(),
    metadata: { includesInternalNotes },
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const job = await db.job.findFirst({
      where: { id: input.jobId.trim(), organizationId },
    });

    if (!job) {
      return { error: "Job not found or access denied." };
    }

    const logDate = new Date(input.logDate);
    logDate.setHours(0, 0, 0, 0);

    let summary = input.summary;
    if (!summary) {
      summary = await generateDailyJobLogDraft({
        organizationId,
        jobId: input.jobId.trim(),
        logDate,
      });
    }

    const writeInternalNotes = canWriteDailyLogInternalNotes(session.role);

    const log = await db.dailyJobLog.upsert({
      where: {
        jobId_logDate: {
          jobId: input.jobId.trim(),
          logDate,
        },
      },
      update: {
        summary,
        ...(writeInternalNotes ? { internalNotes: input.internalNotes } : {}),
        status: {
          set: DailyJobLogStatus.DRAFT,
        },
      },
      create: {
        organizationId,
        jobId: input.jobId.trim(),
        logDate,
        summary,
        internalNotes: writeInternalNotes ? input.internalNotes : null,
        status: DailyJobLogStatus.DRAFT,
      },
    });

    revalidatePath(`/jobs/${input.jobId.trim()}`);
    revalidatePath("/workstation");
    return { success: true, logId: log.id };
  } catch (e) {
    console.error("Failed to save daily log draft", e);
    return { error: "Failed to save daily log. Please try again." };
  }
}

export async function markDailyJobLogReviewedAction(
  logId: string,
): Promise<DailyLogActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.DAILY_LOG_REVIEW,
    resourceType: "dailyJobLog",
    resourceId: logId.trim(),
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const log = await db.dailyJobLog.findFirst({
      where: { id: logId.trim(), organizationId },
    });

    if (!log) {
      return { error: "Daily log not found or access denied." };
    }

    await db.dailyJobLog.update({
      where: { id: logId.trim() },
      data: {
        status: DailyJobLogStatus.REVIEWED,
        reviewedByUserId: session.userId,
        reviewedAt: new Date(),
      },
    });

    revalidatePath(`/jobs/${log.jobId}`);
    revalidatePath("/workstation");
    return { success: true };
  } catch (e) {
    console.error("Failed to mark daily log reviewed", e);
    return { error: "Failed to mark daily log reviewed. Please try again." };
  }
}

export async function voidDailyJobLogAction(logId: string): Promise<DailyLogActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.DAILY_LOG_VOID,
    resourceType: "dailyJobLog",
    resourceId: logId.trim(),
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const log = await db.dailyJobLog.findFirst({
      where: { id: logId.trim(), organizationId },
    });

    if (!log) {
      return { error: "Daily log not found or access denied." };
    }

    await db.dailyJobLog.update({
      where: { id: logId.trim() },
      data: {
        status: DailyJobLogStatus.VOID,
      },
    });

    revalidatePath(`/jobs/${log.jobId}`);
    revalidatePath("/workstation");
    return { success: true };
  } catch (e) {
    console.error("Failed to void daily log", e);
    return { error: "Failed to void daily log. Please try again." };
  }
}
