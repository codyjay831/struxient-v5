"use server";

import { JobVisitStatus, JobActivityType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { enqueueNotification } from "@/lib/notifications/notification-outbox";

export type JobVisitActionState = {
  error?: string;
  success?: boolean;
};

export async function createJobVisitAction(
  jobId: string,
  data: {
    scheduledStartAt: Date;
    scheduledEndAt?: Date;
    assignedUserId?: string;
    notes?: string;
  }
): Promise<JobVisitActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  if (data.scheduledEndAt && data.scheduledEndAt <= data.scheduledStartAt) {
    return { error: "End time must be after start time." };
  }

  try {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
      select: { id: true, title: true },
    });

    if (!job) {
      return { error: "Job not found or access denied." };
    }

    await db.$transaction(async (tx) => {
      const visit = await tx.jobVisit.create({
        data: {
          organizationId,
          jobId,
          scheduledStartAt: data.scheduledStartAt,
          scheduledEndAt: data.scheduledEndAt,
          assignedUserId: data.assignedUserId,
          notes: data.notes,
          status: JobVisitStatus.SCHEDULED,
        },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId,
          type: JobActivityType.VISIT_SCHEDULED,
          title: `Visit scheduled: ${data.scheduledStartAt.toLocaleString()}`,
          details: data.notes || undefined,
          entityType: "JobVisit",
          entityId: visit.id,
          actorUserId: session.userId,
        },
        tx
      );

      await enqueueNotification(
        {
          organizationId,
          userId: data.assignedUserId ?? null,
          kind: "JOB_VISIT_SCHEDULED",
          title: `Visit scheduled: ${job.title}`,
          body: data.notes || undefined,
          dedupeKey: `job-visit-scheduled-${visit.id}-${data.scheduledStartAt.toISOString()}`,
          payloadJson: {
            visitId: visit.id,
            jobId,
            scheduledStartAt: data.scheduledStartAt.toISOString(),
            scheduledEndAt: data.scheduledEndAt?.toISOString() ?? null,
            assignedUserId: data.assignedUserId ?? null,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");

    return { success: true };
  } catch (e) {
    console.error("Failed to create job visit", e);
    return { error: "Failed to schedule visit. Please try again." };
  }
}

export async function rescheduleJobVisitAction(
  visitId: string,
  data: {
    scheduledStartAt: Date;
    scheduledEndAt?: Date;
    notes?: string;
  }
): Promise<JobVisitActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  if (data.scheduledEndAt && data.scheduledEndAt <= data.scheduledStartAt) {
    return { error: "End time must be after start time." };
  }

  try {
    const visit = await db.jobVisit.findFirst({
      where: { id: visitId, organizationId },
      select: { id: true, jobId: true },
    });

    if (!visit) {
      return { error: "Visit not found or access denied." };
    }

    await db.$transaction(async (tx) => {
      await tx.jobVisit.update({
        where: { id: visitId },
        data: {
          scheduledStartAt: data.scheduledStartAt,
          scheduledEndAt: data.scheduledEndAt,
          notes: data.notes,
          status: JobVisitStatus.SCHEDULED, // Ensure it's back to scheduled if it was something else
        },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: visit.jobId,
          type: JobActivityType.VISIT_RESCHEDULED,
          title: `Visit rescheduled to: ${data.scheduledStartAt.toLocaleString()}`,
          details: data.notes || undefined,
          entityType: "JobVisit",
          entityId: visit.id,
          actorUserId: session.userId,
        },
        tx
      );

      await enqueueNotification(
        {
          organizationId,
          kind: "JOB_VISIT_RESCHEDULED",
          title: "Visit rescheduled",
          body: data.notes || undefined,
          dedupeKey: `job-visit-rescheduled-${visit.id}-${data.scheduledStartAt.toISOString()}`,
          payloadJson: {
            visitId: visit.id,
            jobId: visit.jobId,
            scheduledStartAt: data.scheduledStartAt.toISOString(),
            scheduledEndAt: data.scheduledEndAt?.toISOString() ?? null,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath(`/jobs/${visit.jobId}`);
    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");

    return { success: true };
  } catch (e) {
    console.error("Failed to reschedule job visit", e);
    return { error: "Failed to reschedule visit. Please try again." };
  }
}

export async function cancelJobVisitAction(
  visitId: string,
  reason?: string
): Promise<JobVisitActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const visit = await db.jobVisit.findFirst({
      where: { id: visitId, organizationId },
      select: { id: true, jobId: true, scheduledStartAt: true },
    });

    if (!visit) {
      return { error: "Visit not found or access denied." };
    }

    await db.$transaction(async (tx) => {
      await tx.jobVisit.update({
        where: { id: visitId },
        data: { status: JobVisitStatus.CANCELED },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: visit.jobId,
          type: JobActivityType.VISIT_CANCELED,
          title: `Visit canceled: ${visit.scheduledStartAt.toLocaleString()}`,
          details: reason || undefined,
          entityType: "JobVisit",
          entityId: visit.id,
          actorUserId: session.userId,
        },
        tx
      );

      await enqueueNotification(
        {
          organizationId,
          kind: "JOB_VISIT_CANCELED",
          title: `Visit canceled`,
          body: reason || undefined,
          dedupeKey: `job-visit-canceled-${visit.id}`,
          payloadJson: {
            visitId: visit.id,
            jobId: visit.jobId,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath(`/jobs/${visit.jobId}`);
    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");

    return { success: true };
  } catch (e) {
    console.error("Failed to cancel job visit", e);
    return { error: "Failed to cancel visit. Please try again." };
  }
}

export async function completeJobVisitAction(
  visitId: string,
  notes?: string
): Promise<JobVisitActionState> {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;

  try {
    const visit = await db.jobVisit.findFirst({
      where: { id: visitId, organizationId },
      select: { id: true, jobId: true, scheduledStartAt: true },
    });

    if (!visit) {
      return { error: "Visit not found or access denied." };
    }

    await db.$transaction(async (tx) => {
      await tx.jobVisit.update({
        where: { id: visitId },
        data: { 
          status: JobVisitStatus.COMPLETED,
          notes: notes || undefined,
        },
      });

      await recordJobActivity(
        {
          organizationId,
          jobId: visit.jobId,
          type: JobActivityType.VISIT_COMPLETED,
          title: `Visit completed: ${visit.scheduledStartAt.toLocaleString()}`,
          details: notes || undefined,
          entityType: "JobVisit",
          entityId: visit.id,
          actorUserId: session.userId,
        },
        tx
      );

      await enqueueNotification(
        {
          organizationId,
          kind: "JOB_VISIT_COMPLETED",
          title: `Visit completed`,
          body: notes || undefined,
          dedupeKey: `job-visit-completed-${visit.id}`,
          payloadJson: {
            visitId: visit.id,
            jobId: visit.jobId,
            actorUserId: session.userId,
          },
        },
        tx,
      );
    });

    revalidatePath(`/jobs/${visit.jobId}`);
    revalidatePath("/schedule");
    revalidatePath("/workstation");
    revalidatePath("/workstation/schedule");

    return { success: true };
  } catch (e) {
    console.error("Failed to complete job visit", e);
    return { error: "Failed to complete visit. Please try again." };
  }
}
