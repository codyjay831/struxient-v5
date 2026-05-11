import { JobIssueStatus, JobPaymentRequirementStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { JobTaskExecutionPayload } from "@/components/jobs/job-task-execution-types";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";

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
          customer: {
            select: {
              id: true,
              displayName: true,
              organizationId: true,
              serviceLocations: {
                orderBy: { isPrimary: "desc" },
                select: { formattedAddress: true, addressLine1: true, isPrimary: true },
              },
            },
          },
          lead: {
            select: {
              id: true,
              title: true,
              organizationId: true,
              notes: true,
              publicIntakeServiceLocation: true,
            },
          },
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
  const jobsiteAddressLine = resolveJobsiteLineForQuoteOrJob({
    customerLocations: safeCustomer?.serviceLocations ?? [],
    leadRow: safeLead
      ? {
          publicIntakeServiceLocation: safeLead.publicIntakeServiceLocation,
          notes: safeLead.notes,
        }
      : null,
  });
  const primaryIdentity = safeLead?.title || safeCustomer?.displayName || job.title;
  const secondaryIdentity = job.title !== primaryIdentity ? job.title : null;
  const jobContextLabel = secondaryIdentity
    ? `${primaryIdentity} · ${secondaryIdentity}`
    : primaryIdentity;

  const customerId = safeCustomer?.id ?? null;
  const leadEditHref = safeLead ? `/sales/${safeLead.id}/edit` : null;

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
    jobsiteAddressLine,
    customerId,
    leadEditHref,
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
