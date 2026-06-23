"use server";

import { revalidatePath } from "next/cache";
import { JobPaymentRequirementStatus, JobActivityType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { authorizeStaffAction, STAFF_ACTIONS } from "@/lib/authz/staff-actions";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { formatCents } from "@/lib/job-payment-display";
import { publishSignal } from "@/lib/signal-bus";

export type CreateJobPaymentRequirementInput = {
  jobId: string;
  title: string;
  amountCents?: number;
  status?: JobPaymentRequirementStatus;
  requiredBeforeStageId?: string;
  notes?: string;
};

type JobPaymentActionResult =
  | { success: true; requirementId?: string }
  | { error: string };

export async function createJobPaymentRequirementAction(
  input: CreateJobPaymentRequirementInput,
): Promise<JobPaymentActionResult> {
  const session = await requireCurrentSession();

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CREATE,
    resourceType: "job",
    resourceId: input.jobId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const organizationId = session.organizationId;

  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId },
  });

  if (!job) {
    return { error: "Job not found or access denied." };
  }

  if (input.requiredBeforeStageId) {
    const stage = await db.jobStage.findFirst({
      where: { id: input.requiredBeforeStageId, jobId: input.jobId },
    });
    if (!stage) {
      return { error: "Job stage not found or does not belong to this job." };
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

export async function markJobPaymentRequirementPaidAction(
  requirementId: string,
): Promise<JobPaymentActionResult> {
  const session = await requireCurrentSession();

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
    resourceType: "jobPaymentRequirement",
    resourceId: requirementId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const organizationId = session.organizationId;

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });

  if (!requirement) {
    return { error: "Payment requirement not found or access denied." };
  }

  await db.jobPaymentRequirement.update({
    where: { id: requirementId },
    data: {
      status: JobPaymentRequirementStatus.PAID,
      paidAt: new Date(),
    },
  });

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

export async function waiveJobPaymentRequirementAction(
  requirementId: string,
): Promise<JobPaymentActionResult> {
  const session = await requireCurrentSession();

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_WAIVE,
    resourceType: "jobPaymentRequirement",
    resourceId: requirementId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const organizationId = session.organizationId;

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });

  if (!requirement) {
    return { error: "Payment requirement not found or access denied." };
  }

  await db.jobPaymentRequirement.update({
    where: { id: requirementId },
    data: {
      status: JobPaymentRequirementStatus.WAIVED,
      waivedAt: new Date(),
    },
  });

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

export async function cancelJobPaymentRequirementAction(
  requirementId: string,
): Promise<JobPaymentActionResult> {
  const session = await requireCurrentSession();

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_CANCEL,
    resourceType: "jobPaymentRequirement",
    resourceId: requirementId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const organizationId = session.organizationId;

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });

  if (!requirement) {
    return { error: "Payment requirement not found or access denied." };
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

export async function updateJobPaymentRequirementPortalLinkAction(
  requirementId: string,
  paymentUrl: string | null,
  paymentUrlLabel: string | null,
): Promise<JobPaymentActionResult> {
  const session = await requireCurrentSession();

  const authorization = await authorizeStaffAction(session, {
    action: STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_PORTAL_LINK_UPDATE,
    resourceType: "jobPaymentRequirement",
    resourceId: requirementId,
  });
  if (!authorization.ok) {
    return { error: authorization.message };
  }

  const organizationId = session.organizationId;

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: { id: requirementId, organizationId },
  });
  if (!requirement) {
    return { error: "Payment requirement not found or access denied." };
  }

  const trimmedUrl = paymentUrl?.trim() || null;
  if (trimmedUrl) {
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { error: "Enter a valid payment URL (https://…)." };
      }
    } catch {
      return { error: "Enter a valid payment URL (https://…)." };
    }
  }

  await db.jobPaymentRequirement.update({
    where: { id: requirementId },
    data: {
      paymentUrl: trimmedUrl,
      paymentUrlLabel: paymentUrlLabel?.trim() || null,
    },
  });

  revalidatePath("/workstation");
  revalidatePath(`/jobs/${requirement.jobId}`);

  return { success: true };
}
