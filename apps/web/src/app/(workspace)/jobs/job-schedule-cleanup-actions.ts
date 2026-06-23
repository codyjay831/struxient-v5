"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";
import { authorizeStaffAction, STAFF_ACTIONS } from "@/lib/authz/staff-actions";
import {
  buildScheduleCleanupReviewItems,
  executeScheduleCleanupBatch,
  loadPendingScheduleCleanupEvents,
  type ScheduleCleanupSelection,
} from "@/lib/scheduling/job-cancel-cleanup";

export type JobScheduleCleanupActionState = {
  error?: string;
  success?: boolean;
};

export async function confirmJobScheduleCleanupAction(input: {
  jobId: string;
  reviewReason: string;
  selections: ScheduleCleanupSelection[];
  spawnExternalFollowUpTasks?: boolean;
}): Promise<JobScheduleCleanupActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.JOB_SCHEDULE_CLEANUP_CONFIRM,
    resourceType: "job",
    resourceId: input.jobId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  try {
    const result = await db.$transaction(async (tx) =>
      executeScheduleCleanupBatch(
        {
          organizationId,
          jobId: input.jobId,
          actorUserId: session.userId,
          reviewReason: input.reviewReason,
          selections: input.selections,
          spawnExternalFollowUpTasks: input.spawnExternalFollowUpTasks ?? true,
        },
        tx,
      ),
    );

    if ("error" in result) return { error: result.error };

    revalidatePath(`/jobs/${input.jobId}`);
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");
    revalidatePath("/schedule");

    return { success: true };
  } catch (error) {
    console.error("Failed to confirm schedule cleanup", error);
    return { error: "Failed to complete schedule cleanup review." };
  }
}

export async function loadJobScheduleCleanupReviewAction(jobId: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  const job = await db.job.findFirst({
    where: {
      id: jobId,
      organizationId,
      ...getJobVisibilityWhere(session.role, session.userId),
    },
    select: { id: true, title: true, status: true },
  });
  if (!job) return null;

  const pendingEvents = await loadPendingScheduleCleanupEvents(jobId, organizationId);
  const reviewItems = buildScheduleCleanupReviewItems(pendingEvents);

  return {
    job,
    reviewItems,
  };
}
