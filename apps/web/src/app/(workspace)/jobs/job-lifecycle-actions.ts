"use server";

import { JobActivityType, JobStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMutableSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";

export type JobLifecycleActionState = {
  error?: string;
  success?: boolean;
};

export async function archiveJobAction(
  jobId: string,
  reason?: string,
): Promise<JobLifecycleActionState> {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  try {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true, title: true, status: true },
    });

    if (!job) return { error: "Job not found or access denied." };
    if (job.status === JobStatus.ARCHIVED) {
      return { error: "Job is already archived." };
    }

    await db.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: { status: JobStatus.ARCHIVED },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: job.id,
          type: JobActivityType.JOB_ARCHIVED,
          title: `Job archived: ${job.title}`,
          details: reason?.trim() || "Job archived; schedule cleanup review may be required.",
          actorUserId: session.userId,
        },
        tx,
      );
    });

    revalidatePath(`/jobs/${job.id}`);
    revalidatePath("/jobs");
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");
    revalidatePath("/schedule");

    return { success: true };
  } catch (error) {
    console.error("Failed to archive job", error);
    return { error: "Failed to archive job." };
  }
}
