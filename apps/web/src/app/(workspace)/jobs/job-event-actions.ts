"use server";

import { db } from "@/lib/db";
import { requireMutableSession } from "@/lib/session";
import { JobActivityType, JobTaskStatus, LineItemTemplateTaskSource } from "@prisma/client";
import { recordJobActivity } from "@/lib/job-activity-helper";
import {
  getFieldEventSignal,
  isRemovableFieldEventTask,
  removeEventSignalFromRequires,
} from "@/lib/field-event-ui";
import { retractSignal } from "@/lib/signal-bus";
import { revalidatePath } from "next/cache";

export type JobEventActionState = {
  error?: string;
  success?: boolean;
};

/**
 * Creates a "Job Event" which is a synthetic task that blocks downstream work.
 * It creates a task that provides a unique signal, and adds that signal to the
 * requiresSignals of the chosen downstream tasks.
 */
export async function addJobEventAction(
  jobId: string,
  title: string,
  description: string,
  targetTaskIds: string[],
): Promise<JobEventActionState> {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  try {
    const job = await db.job.findFirst({
      where: { id: jobId, organizationId },
      include: {
        stages: {
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
      },
    });

    if (!job) return { error: "Job not found." };
    if (job.stages.length === 0) return { error: "Job has no stages." };

    const firstStage = job.stages[0];
    const eventSignal = `event:${Math.random().toString(36).substring(2, 9)}`;

    await db.$transaction(async (tx) => {
      // 1. Create the event task
      const eventTask = await tx.jobTask.create({
        data: {
          jobId,
          jobStageId: firstStage.id,
          title: `EVENT: ${title}`,
          instructions: description,
          category: "GENERAL",
          status: JobTaskStatus.TODO,
          providesSignals: [eventSignal],
          sortOrder: -1, // Always at the top
          sourceType: LineItemTemplateTaskSource.CUSTOM,
        },
      });

      // 2. Update target tasks to require this signal
      for (const taskId of targetTaskIds) {
        const task = await tx.jobTask.findUnique({
          where: { id: taskId },
          select: { requiresSignals: true },
        });

        if (task) {
          await tx.jobTask.update({
            where: { id: taskId },
            data: {
              requiresSignals: [...task.requiresSignals, eventSignal],
            },
          });
        }
      }

      // 3. Record activity
      await recordJobActivity(
        {
          organizationId,
          jobId,
          type: JobActivityType.EVENT_CREATED,
          title: `Event created: ${title}`,
          details: description,
          entityType: "JobTask",
          entityId: eventTask.id,
          actorUserId: session.userId,
        },
        tx
      );
    });

    revalidatePath(`/jobs/${jobId}`);
    return { success: true };
  } catch (e) {
    console.error("Failed to create event", e);
    return { error: "Failed to create event." };
  }
}

/**
 * Resolving an event task publishes the signal, unblocking downstream work.
 * This is already handled by the standard task completion logic if the task
 * has providesSignals.
 */

/**
 * Removing an event task should retract the signal and remove the requirement
 * from downstream tasks.
 */
export async function removeJobEventAction(
  jobId: string,
  eventTaskId: string,
): Promise<JobEventActionState> {
  const session = await requireMutableSession();
  const organizationId = session.organizationId;

  try {
    const task = await db.jobTask.findFirst({
      where: { id: eventTaskId, jobId, job: { organizationId } },
    });

    if (!task) return { error: "Event task not found." };

    if (!isRemovableFieldEventTask(task.title, task.providesSignals)) {
      return { error: "Only active field hold tasks can be cancelled." };
    }

    const eventSignal = getFieldEventSignal(task.providesSignals);

    await db.$transaction(async (tx) => {
      // 1. Remove the requirement from all tasks in the job
      if (eventSignal) {
        const affectedTasks = await tx.jobTask.findMany({
          where: { jobId, job: { organizationId }, requiresSignals: { has: eventSignal } },
          select: { id: true, requiresSignals: true },
        });

        for (const t of affectedTasks) {
          await tx.jobTask.update({
            where: { id: t.id },
            data: {
              requiresSignals: removeEventSignalFromRequires(t.requiresSignals, eventSignal),
            },
          });
        }

        // 2. Retract signal from bus
        await retractSignal({ jobId, name: eventSignal, tx });
      }

      // 3. Delete the task
      await tx.jobTask.delete({
        where: { id: eventTaskId },
      });

      // 4. Record activity
      await recordJobActivity(
        {
          organizationId,
          jobId,
          type: JobActivityType.EVENT_RESOLVED,
          title: `Event removed: ${task.title}`,
          entityType: "JobTask",
          entityId: eventTaskId,
          actorUserId: session.userId,
        },
        tx
      );
    });

    revalidatePath(`/jobs/${jobId}`);
    return { success: true };
  } catch (e) {
    console.error("Failed to remove event", e);
    return { error: "Failed to remove event." };
  }
}
