"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireMutableSession } from "@/lib/session";
import {
  assignTaskWorkPackage,
  createWorkPackage,
} from "@/lib/scheduling/work-package-service";
import { assertSchedulePermission } from "@/lib/scheduling/schedule-permissions";

type WorkPackageActionState = {
  error?: string;
  success?: boolean;
  workPackageId?: string;
};

export async function createJobWorkPackageAction(input: {
  jobId: string;
  title: string;
  workType?: string | null;
  plannedStartDate?: Date | null;
  plannedEndDate?: Date | null;
  source?: string | null;
  taskIds?: string[];
}): Promise<WorkPackageActionState> {
  const session = await requireMutableSession();
  const permission = assertSchedulePermission(session.role, "create_tentative");
  if (!permission.ok) return { error: permission.error };

  const result = await db.$transaction(async (tx) => {
    const created = await createWorkPackage(
      {
        organizationId: session.organizationId,
        jobId: input.jobId,
        title: input.title,
        workType: input.workType,
        plannedStartDate: input.plannedStartDate,
        plannedEndDate: input.plannedEndDate,
        source: input.source,
        actorUserId: session.userId,
      },
      tx,
    );
    if ("error" in created) return created;

    for (const taskId of input.taskIds ?? []) {
      const assigned = await assignTaskWorkPackage(
        {
          organizationId: session.organizationId,
          taskId,
          workPackageId: created.workPackageId,
          actorUserId: session.userId,
        },
        tx,
      );
      if ("error" in assigned) return assigned;
    }

    return { success: true as const, workPackageId: created.workPackageId };
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/jobs/${input.jobId}`);
  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true, workPackageId: result.workPackageId };
}

export async function setTaskWorkPackageAction(
  taskId: string,
  workPackageId: string | null,
): Promise<WorkPackageActionState> {
  const session = await requireMutableSession();
  const permission = assertSchedulePermission(session.role, "link_unlink_tasks");
  if (!permission.ok) return { error: permission.error };

  const result = await db.$transaction(async (tx) => {
    const assigned = await assignTaskWorkPackage(
      {
        organizationId: session.organizationId,
        taskId,
        workPackageId,
        actorUserId: session.userId,
      },
      tx,
    );
    if ("error" in assigned) return assigned;

    const task = await tx.jobTask.findUnique({
      where: { id: taskId },
      select: { jobId: true },
    });
    if (!task) return { error: "Task not found." };
    return { success: true as const, jobId: task.jobId };
  });
  if ("error" in result) return { error: result.error };

  revalidatePath(`/jobs/${result.jobId}`);
  revalidatePath("/schedule");
  revalidatePath("/workstation");
  revalidatePath("/workstation/schedule");
  return { success: true };
}
