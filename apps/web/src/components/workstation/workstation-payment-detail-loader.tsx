import { getRequestContextOrThrow } from "@/lib/auth-context";
import { canReadPaymentDetails } from "@/lib/authz/payment-visibility";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";
import { db } from "@/lib/db";
import { JobPaymentManager } from "@/components/jobs/job-payment-manager";
import {
  attachScheduleAnchorsToRequirements,
  buildPaymentDueContextFromJob,
  getUnsettledEffectivelyDueRequirements,
  loadScheduleAnchorsByIds,
} from "@/lib/job-payment-readiness";

type WorkstationPaymentDetailLoaderProps = {
  requirementId: string;
  jobId: string;
};

export async function WorkstationPaymentDetailLoader({
  requirementId,
  jobId,
}: WorkstationPaymentDetailLoaderProps) {
  const ctx = await getRequestContextOrThrow();

  if (!canReadPaymentDetails(ctx.role)) {
    return null;
  }

  const requirement = await db.jobPaymentRequirement.findFirst({
    where: {
      id: requirementId,
      jobId,
      organizationId: ctx.organizationId,
      job: getJobVisibilityWhere(ctx.role, ctx.userId),
    },
    select: { id: true },
  });

  if (!requirement) return null;

  const job = await db.job.findFirst({
    where: {
      id: jobId,
      organizationId: ctx.organizationId,
      ...getJobVisibilityWhere(ctx.role, ctx.userId),
    },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          stageId: true,
          tasks: {
            select: { status: true, recoveryFlowId: true },
          },
        },
      },
      paymentRequirements: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          amountCents: true,
          status: true,
          notes: true,
          paymentUrl: true,
          paymentUrlLabel: true,
          requiredBeforeStageId: true,
          sourcePaymentScheduleItemId: true,
          paidAt: true,
          waivedAt: true,
          canceledAt: true,
          requiredBeforeStage: { select: { title: true } },
        },
      },
    },
  });

  if (!job) return null;

  const paymentScheduleAnchors = await loadScheduleAnchorsByIds(
    job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
  );
  const paymentRequirementsWithAnchors = attachScheduleAnchorsToRequirements(
    job.paymentRequirements,
    paymentScheduleAnchors,
  );

  const paymentDueContext = buildPaymentDueContextFromJob({
    status: job.status,
    stages: job.stages,
    paymentRequirements: paymentRequirementsWithAnchors,
  });
  const effectivelyDueRequirements = getUnsettledEffectivelyDueRequirements(
    paymentRequirementsWithAnchors,
    paymentDueContext,
  );

  return (
    <JobPaymentManager
      jobId={jobId}
      initialRequirements={paymentRequirementsWithAnchors}
      stages={job.stages.map((s) => ({ id: s.id, title: s.title }))}
      effectivelyDueRequirementIds={effectivelyDueRequirements.map((r) => r.id)}
      variant="embedded"
      focusId={requirementId}
    />
  );
}
