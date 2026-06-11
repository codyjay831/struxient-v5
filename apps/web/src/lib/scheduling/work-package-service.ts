import { JobActivityType, type Prisma } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { recordJobActivity } from "@/lib/job-activity-helper";

export type WorkPackageServiceError = { error: string };

async function auditWorkPackageMutation(
  input: {
    organizationId: string;
    jobId: string;
    workPackageId: string;
    actorUserId?: string;
    title: string;
    details?: string;
    metadataJson?: Prisma.InputJsonValue;
  },
  tx: ExtendedTransactionClient,
) {
  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: JobActivityType.SCHEDULE_EVENT_CREATED,
      title: input.title,
      details: input.details,
      entityType: "JobWorkPackage",
      entityId: input.workPackageId,
      actorUserId: input.actorUserId,
      metadataJson: input.metadataJson,
    },
    tx,
  );
}

export async function createWorkPackage(
  input: {
    organizationId: string;
    jobId: string;
    title: string;
    workType?: string | null;
    plannedStartDate?: Date | null;
    plannedEndDate?: Date | null;
    source?: string | null;
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; workPackageId: string } | WorkPackageServiceError> {
  const title = input.title.trim();
  if (!title) return { error: "Work group title is required." };
  if (
    input.plannedStartDate &&
    input.plannedEndDate &&
    input.plannedEndDate < input.plannedStartDate
  ) {
    return { error: "Planned end date must be on or after planned start date." };
  }

  const maxOrder = await tx.jobWorkPackage.aggregate({
    where: { organizationId: input.organizationId, jobId: input.jobId },
    _max: { displayOrder: true },
  });
  const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

  const created = await tx.jobWorkPackage.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title,
      workType: input.workType?.trim() || null,
      plannedStartDate: input.plannedStartDate ?? null,
      plannedEndDate: input.plannedEndDate ?? null,
      source: input.source?.trim() || null,
      displayOrder,
    },
    select: { id: true },
  });

  await auditWorkPackageMutation(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      workPackageId: created.id,
      actorUserId: input.actorUserId,
      title: `Work group created: ${title}`,
      metadataJson: {
        workType: input.workType ?? null,
        plannedStartDate: input.plannedStartDate?.toISOString() ?? null,
        plannedEndDate: input.plannedEndDate?.toISOString() ?? null,
        source: input.source ?? null,
      },
    },
    tx,
  );

  return { success: true, workPackageId: created.id };
}

export async function assignTaskWorkPackage(
  input: {
    organizationId: string;
    taskId: string;
    workPackageId: string | null;
    actorUserId?: string;
  },
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | WorkPackageServiceError> {
  const task = await tx.jobTask.findFirst({
    where: { id: input.taskId, job: { organizationId: input.organizationId } },
    select: { id: true, jobId: true, title: true, workPackageId: true },
  });
  if (!task) return { error: "Task not found." };

  if (input.workPackageId) {
    const workPackage = await tx.jobWorkPackage.findFirst({
      where: {
        id: input.workPackageId,
        organizationId: input.organizationId,
        jobId: task.jobId,
      },
      select: { id: true, title: true },
    });
    if (!workPackage) return { error: "Work group not found on this job." };
  }

  await tx.jobTask.update({
    where: { id: task.id },
    data: { workPackageId: input.workPackageId },
  });

  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: task.jobId,
      type: JobActivityType.SCHEDULE_EVENT_TASK_LINKED,
      title: input.workPackageId
        ? `Task added to work group: ${task.title}`
        : `Task removed from work group: ${task.title}`,
      entityType: "JobTask",
      entityId: task.id,
      actorUserId: input.actorUserId,
      metadataJson: {
        before: { workPackageId: task.workPackageId },
        after: { workPackageId: input.workPackageId },
      },
    },
    tx,
  );

  return { success: true };
}
