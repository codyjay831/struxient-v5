import { JobIssueStatus, JobPaymentRequirementStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { JobTaskExecutionPayload } from "@/components/jobs/job-task-execution-types";

/**
 * Loads a single job task with the same facts used for readiness on the job page,
 * scoped to the organization via the job relation.
 */
export async function loadJobTaskExecutionPayload(
  taskId: string,
  organizationId: string,
): Promise<JobTaskExecutionPayload | null> {
  const task = await db.jobTask.findFirst({
    where: { id: taskId, job: { organizationId } },
    select: {
      id: true,
      title: true,
      status: true,
      instructions: true,
      completedAt: true,
      completionNote: true,
      completionRequirementsJson: true,
      jobStageId: true,
      jobStage: { select: { id: true, title: true, sortOrder: true } },
      job: {
        select: {
          id: true,
          title: true,
          customer: { select: { displayName: true, organizationId: true } },
          lead: { select: { title: true, organizationId: true } },
          paymentRequirements: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              title: true,
              status: true,
              requiredBeforeStageId: true,
              requiredBeforeStage: { select: { title: true, sortOrder: true } },
            },
          },
        },
      },
      attachments: {
        where: { status: "READY" },
        select: {
          id: true,
          fileName: true,
          fileKey: true,
          contentType: true,
        },
      },
      issues: {
        where: { status: JobIssueStatus.OPEN },
        select: { status: true, severity: true },
      },
    },
  });

  if (!task) return null;

  const job = task.job;
  const safeCustomer =
    job.customer && job.customer.organizationId === organizationId ? job.customer : null;
  const safeLead = job.lead && job.lead.organizationId === organizationId ? job.lead : null;
  const primaryIdentity = safeLead?.title || safeCustomer?.displayName || job.title;
  const secondaryIdentity = job.title !== primaryIdentity ? job.title : null;
  const jobContextLabel = secondaryIdentity
    ? `${primaryIdentity} · ${secondaryIdentity}`
    : primaryIdentity;

  const taskPaymentBlockers = job.paymentRequirements.filter((p) => {
    if (p.status !== JobPaymentRequirementStatus.DUE) return false;
    if (p.requiredBeforeStageId === null) return true;
    if (p.requiredBeforeStage) {
      return task.jobStage.sortOrder >= p.requiredBeforeStage.sortOrder;
    }
    return false;
  });

  return {
    jobId: job.id,
    jobStageId: task.jobStage.id,
    stageTitle: task.jobStage.title,
    jobContextLabel,
    jobHref: `/jobs/${job.id}`,
    task: {
      id: task.id,
      title: task.title,
      status: task.status,
      instructions: task.instructions,
      completedAt: task.completedAt,
      completionNote: task.completionNote,
      completionRequirementsJson: task.completionRequirementsJson,
      attachments: task.attachments,
      issues: task.issues,
      paymentBlockers: taskPaymentBlockers,
    },
  };
}
