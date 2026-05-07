"use server";

import { JobTaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db, getDevOrganizationOrThrow } from "@/lib/db";

export type JobTaskActionState = {
  error?: string;
};

export async function updateJobTaskStatusAction(
  taskId: string,
  status: JobTaskStatus,
): Promise<JobTaskActionState> {
  const org = await getDevOrganizationOrThrow();

  try {
    const task = await db.jobTask.findFirst({
      where: { id: taskId, job: { organizationId: org.id } },
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
