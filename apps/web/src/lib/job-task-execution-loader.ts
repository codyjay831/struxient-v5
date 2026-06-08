import { JobIssueSeverity, JobIssueStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { JobTaskExecutionPayload } from "@/components/jobs/job-task-execution-types";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { deriveLeadTitle } from "@/lib/lead/lead-projection";
import {
  attachScheduleAnchorsToRequirements,
  buildPaymentDueContextFromJob,
  deriveTaskPaymentHold,
  loadScheduleAnchorsByIds,
} from "@/lib/job-payment-readiness";

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
      dueAt: true,
      scheduledStartAt: true,
      scheduledEndAt: true,
      assignedUserId: true,
      providesSignals: true,
      requiresSignals: true,
      hardSignal: true,
      jobStageId: true,
      recoveryFlow: {
        select: { jobIssueId: true },
      },
      jobStage: {
        select: {
          id: true,
          title: true,
          sortOrder: true,
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            select: { id: true, status: true, severity: true },
          },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          status: true,
          stages: {
            select: {
              id: true,
              sortOrder: true,
              stageId: true,
              title: true,
              tasks: {
                select: {
                  status: true,
                  recoveryFlowId: true,
                },
              },
            },
          },
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
              organizationId: true,
              contact: true,
              request: true,
              address: true,
              signals: true,
            },
          },
          paymentRequirements: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              title: true,
              status: true,
              requiredBeforeStageId: true,
              sourcePaymentScheduleItemId: true,
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
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          severity: true,
          type: true,
          createdAt: true,
          createdByUser: { select: { name: true } },
          recoveryFlow: {
            select: {
              id: true,
              status: true,
              tasks: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!task) return null;

  const job = task.job;
  const safeCustomer =
    job.customer && job.customer.organizationId === organizationId ? job.customer : null;
  const safeLead =
    job.lead && job.lead.organizationId === organizationId ? job.lead : null;
  const jobsiteAddressLine = resolveJobsiteLineForQuoteOrJob({
    customerLocations: safeCustomer?.serviceLocations ?? [],
    leadRow: safeLead
      ? {
          address: safeLead.address,
          signals: safeLead.signals,
        }
      : null,
  });
  const safeLeadTitle = safeLead
    ? deriveLeadTitle(safeLead.contact, safeLead.request)
    : null;
  const primaryIdentity = safeLeadTitle || safeCustomer?.displayName || job.title;
  const secondaryIdentity = job.title !== primaryIdentity ? job.title : null;
  const jobContextLabel = secondaryIdentity
    ? `${primaryIdentity} · ${secondaryIdentity}`
    : primaryIdentity;

  const customerId = safeCustomer?.id ?? null;
  const leadEditHref = safeLead ? `/leads/${safeLead.id}/edit` : null;

  const paymentScheduleAnchors = await loadScheduleAnchorsByIds(
    job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
  );
  const paymentRequirementsWithAnchors = attachScheduleAnchorsToRequirements(
    job.paymentRequirements,
    paymentScheduleAnchors,
  );

  const paymentCtx = buildPaymentDueContextFromJob({
    status: job.status,
    stages: job.stages,
    paymentRequirements: paymentRequirementsWithAnchors,
  });

  const paymentHold = deriveTaskPaymentHold(
    task.jobStageId,
    paymentRequirementsWithAnchors,
    paymentCtx,
  );

  return {
    jobId: job.id,
    jobStageId: task.jobStage.id,
    stageTitle: task.jobStage.title,
    stageIssues: task.jobStage.issues,
    paymentHold,
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
      dueAt: task.dueAt,
      scheduledStartAt: task.scheduledStartAt,
      scheduledEndAt: task.scheduledEndAt,
      assignedUserId: task.assignedUserId,
      attachments: task.attachments,
      issues: task.issues,
      providesSignals: task.providesSignals,
      requiresSignals: task.requiresSignals,
      hardSignal: task.hardSignal,
      recoveryFlow: task.recoveryFlow ?? null,
    },
  };
}
