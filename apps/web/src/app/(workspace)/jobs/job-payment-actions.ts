"use server";

import { revalidatePath } from "next/cache";
import { JobPaymentRequirementStatus, JobActivityType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { formatCents } from "@/lib/job-payment-display";
import { publishSignal } from "@/lib/signal-bus";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";

export type CreateJobPaymentRequirementInput = {
  jobId: string;
  title: string;
  amountCents?: number;
  status?: JobPaymentRequirementStatus;
  requiredBeforeStageId?: string;
  notes?: string;
};

export async function createJobPaymentRequirementAction(input: CreateJobPaymentRequirementInput) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;
  const permission = assertExecutionPlanPermission(session.role, "adjust_payments");
  if (!permission.ok) {
    throw new Error(permission.error);
  }

  // Verify job belongs to organization
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId },
  });

  if (!job) {
    throw new Error("Job not found or access denied.");
  }

  // Verify stage belongs to job if provided
  if (input.requiredBeforeStageId) {
    const stage = await db.jobStage.findFirst({
      where: { id: input.requiredBeforeStageId, jobId: input.jobId },
    });
    if (!stage) {
      throw new Error("Job stage not found or does not belong to this job.");
    }
  }

  const requirement = await db.jobPaymentRequirement.create({
    data: {
      organizationId,
      jobId: input.jobId,
      title: input.title,
      amountCents: input.amountCents,
      status: input.status ?? JobPaymentRequirementStatus.PENDING,
      requiredBeforeStageId: input.requiredBeforeStageId,
      notes: input.notes,
    },
  });

  await recordJobActivity({
    organizationId,
    jobId: input.jobId,
    type: JobActivityType.PAYMENT_REQUIREMENT_CREATED,
    title: `Payment requirement created: ${input.title}`,
    details: input.notes,
    entityType: "JobPaymentRequirement",
    entityId: requirement.id,
    actorUserId: session.userId,
    metadataJson: {
      amountCents: input.amountCents,
      status: requirement.status,
    },
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${input.jobId}`);

  return { success: true, requirementId: requirement.id };
}

export async function markJobPaymentRequirementPaidAction(requirementId: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;
  const permission = assertExecutionPlanPermission(session.role, "adjust_payments");
  if (!permission.ok) {
    throw new Error(permission.error);
  }

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });

  if (!requirement) {
    throw new Error("Payment requirement not found or access denied.");
  }

  await db.jobPaymentRequirement.update({
    where: { id: requirementId },
    data: {
      status: JobPaymentRequirementStatus.PAID,
      paidAt: new Date(),
    },
  });

  // Publish payment-cleared signal
  await publishSignal({
    jobId: requirement.jobId,
    name: "payment-cleared",
  });

  await recordJobActivity({
    organizationId,
    jobId: requirement.jobId,
    type: JobActivityType.PAYMENT_REQUIREMENT_PAID,
    title: `Payment recorded: ${requirement.title}`,
    details: requirement.amountCents ? `Amount: ${formatCents(requirement.amountCents)}` : undefined,
    entityType: "JobPaymentRequirement",
    entityId: requirement.id,
    actorUserId: session.userId,
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${requirement.jobId}`);

  return { success: true };
}

export async function waiveJobPaymentRequirementAction(requirementId: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;
  const permission = assertExecutionPlanPermission(session.role, "adjust_payments");
  if (!permission.ok) {
    throw new Error(permission.error);
  }

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });

  if (!requirement) {
    throw new Error("Payment requirement not found or access denied.");
  }

  await db.jobPaymentRequirement.update({
    where: { id: requirementId },
    data: {
      status: JobPaymentRequirementStatus.WAIVED,
      waivedAt: new Date(),
    },
  });

  // Publish payment-cleared signal
  await publishSignal({
    jobId: requirement.jobId,
    name: "payment-cleared",
  });

  await recordJobActivity({
    organizationId,
    jobId: requirement.jobId,
    type: JobActivityType.PAYMENT_REQUIREMENT_WAIVED,
    title: `Payment waived: ${requirement.title}`,
    entityType: "JobPaymentRequirement",
    entityId: requirement.id,
    actorUserId: session.userId,
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${requirement.jobId}`);

  return { success: true };
}

export async function cancelJobPaymentRequirementAction(requirementId: string) {
  const session = await requireCurrentSession();
  const organizationId = session.organizationId;
  const permission = assertExecutionPlanPermission(session.role, "adjust_payments");
  if (!permission.ok) {
    throw new Error(permission.error);
  }

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });

  if (!requirement) {
    throw new Error("Payment requirement not found or access denied.");
  }

  await db.jobPaymentRequirement.update({
    where: { id: requirementId },
    data: {
      status: JobPaymentRequirementStatus.CANCELED,
      canceledAt: new Date(),
    },
  });

  await recordJobActivity({
    organizationId,
    jobId: requirement.jobId,
    type: JobActivityType.PAYMENT_REQUIREMENT_CANCELED,
    title: `Payment canceled: ${requirement.title}`,
    entityType: "JobPaymentRequirement",
    entityId: requirement.id,
    actorUserId: session.userId,
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${requirement.jobId}`);

  return { success: true };
}
