import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
  JobTaskStatus,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";

export type ScheduleAnchor = {
  anchorType: PaymentScheduleAnchorType;
  anchorStageId: string | null;
};

/** Minimal issue shape for stage-level blocking checks. */
export type PaymentRequirementRow = {
  id: string;
  title: string;
  status: JobPaymentRequirementStatus;
  requiredBeforeStageId: string | null;
  sourcePaymentScheduleItemId: string | null;
  sourcePaymentScheduleItem?: ScheduleAnchor | null;
};

/** Loads schedule anchor facts by lineage id (no Prisma relation on JobPaymentRequirement). */
export async function loadScheduleAnchorsByIds(
  scheduleItemIds: Array<string | null | undefined>,
  client: {
    paymentScheduleItem: {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: { id: true; anchorType: true; anchorStageId: true };
      }) => Promise<
        Array<{ id: string; anchorType: PaymentScheduleAnchorType; anchorStageId: string | null }>
      >;
    };
  } = db,
): Promise<Map<string, ScheduleAnchor>> {
  const ids = [...new Set(scheduleItemIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const items = await client.paymentScheduleItem.findMany({
    where: { id: { in: ids } },
    select: { id: true, anchorType: true, anchorStageId: true },
  });

  return new Map(items.map((item) => [item.id, item]));
}

export function attachScheduleAnchorsToRequirements<
  T extends { sourcePaymentScheduleItemId: string | null },
>(
  requirements: T[],
  anchorsById: Map<string, ScheduleAnchor>,
): Array<T & { sourcePaymentScheduleItem: ScheduleAnchor | null }> {
  return requirements.map((req) => ({
    ...req,
    sourcePaymentScheduleItem: req.sourcePaymentScheduleItemId
      ? (anchorsById.get(req.sourcePaymentScheduleItemId) ?? null)
      : null,
  }));
}

export type PaymentDueStageInfo = {
  id: string;
  sortOrder: number;
  /** Derived stage execution state for progression and payment anchors. */
  executionState: "OPEN" | "COMPLETED" | "SKIPPED";
  /** True for corrections/recovery-only stages (excluded from FINAL_BALANCE main-path check). */
  isRecoveryStage?: boolean;
};

/**
 * Context for deriving whether a payment requirement is effectively due.
 * Built once per job and reused across requirements.
 */
export type PaymentDueContext = {
  /** Job is active (used for UPON_APPROVAL deposit timing). */
  jobIsActive: boolean;
  stages: PaymentDueStageInfo[];
  /** Map org Stage.id → JobStage.id for AFTER_STAGE anchor resolution. */
  orgStageIdToJobStageId: Record<string, string>;
  /** All requirements on the job (needed for FINAL_BALANCE settlement check). */
  allRequirements: PaymentRequirementRow[];
};

const TERMINAL_STATUSES: JobPaymentRequirementStatus[] = [
  JobPaymentRequirementStatus.PAID,
  JobPaymentRequirementStatus.WAIVED,
  JobPaymentRequirementStatus.CANCELED,
];

function isSettled(status: JobPaymentRequirementStatus): boolean {
  return status === JobPaymentRequirementStatus.PAID || status === JobPaymentRequirementStatus.WAIVED;
}

function getMainPathStages(ctx: PaymentDueContext): PaymentDueStageInfo[] {
  return ctx.stages.filter((s) => !s.isRecoveryStage);
}

function hasReachedStage(ctx: PaymentDueContext, targetJobStageId: string): boolean {
  const target = ctx.stages.find((s) => s.id === targetJobStageId);
  if (!target) return false;
  if (target.executionState === "SKIPPED") return false;

  const mainStages = getMainPathStages(ctx);
  const earliestOpen = mainStages.find((s) => s.executionState === "OPEN");
  if (!earliestOpen) return true;

  return earliestOpen.sortOrder >= target.sortOrder;
}

function isAfterStageAnchorMet(
  ctx: PaymentDueContext,
  anchorStageId: string | null,
): boolean {
  if (!anchorStageId) return false;
  const jobStageId = ctx.orgStageIdToJobStageId[anchorStageId];
  if (!jobStageId) return false;
  const stage = ctx.stages.find((s) => s.id === jobStageId);
  return stage?.executionState === "COMPLETED";
}

function areOtherRequirementsSettled(
  requirement: PaymentRequirementRow,
  ctx: PaymentDueContext,
): boolean {
  return ctx.allRequirements
    .filter((r) => r.id !== requirement.id && !TERMINAL_STATUSES.includes(r.status))
    .every((r) => isSettled(r.status));
}

function isMainPathComplete(ctx: PaymentDueContext): boolean {
  const main = getMainPathStages(ctx);
  if (main.length === 0) return false;
  return main.every((s) => s.executionState === "COMPLETED");
}

/**
 * Determines whether a payment requirement should be treated as due for
 * workstation attention, task holds, and promotion.
 *
 * FINAL_BALANCE conservative v1 rule:
 * - PENDING + FINAL_BALANCE is only auto-due when anchor join confirms
 *   anchorType, all other requirements are settled, and main-path stages complete.
 * - Missing/ambiguous anchor data → not auto-due (staff must mark DUE).
 */
export function isPaymentEffectivelyDue(
  requirement: PaymentRequirementRow,
  ctx: PaymentDueContext,
): boolean {
  if (TERMINAL_STATUSES.includes(requirement.status)) {
    return false;
  }

  if (requirement.status === JobPaymentRequirementStatus.DUE) {
    return true;
  }

  if (requirement.status !== JobPaymentRequirementStatus.PENDING) {
    return false;
  }

  // Manual requirements (no schedule lineage) — never auto-due while PENDING
  if (!requirement.sourcePaymentScheduleItemId) {
    return false;
  }

  const anchor = requirement.sourcePaymentScheduleItem;
  if (!anchor?.anchorType) {
    return false;
  }

  switch (anchor.anchorType) {
    case PaymentScheduleAnchorType.UPON_APPROVAL:
      return ctx.jobIsActive;

    case PaymentScheduleAnchorType.BEFORE_STAGE:
      if (!requirement.requiredBeforeStageId) return false;
      return hasReachedStage(ctx, requirement.requiredBeforeStageId);

    case PaymentScheduleAnchorType.AFTER_STAGE:
      return isAfterStageAnchorMet(ctx, anchor.anchorStageId);

    case PaymentScheduleAnchorType.FINAL_BALANCE:
      if (anchor.anchorType !== PaymentScheduleAnchorType.FINAL_BALANCE) {
        return false;
      }
      if (!areOtherRequirementsSettled(requirement, ctx)) {
        return false;
      }
      if (!isMainPathComplete(ctx)) {
        return false;
      }
      return true;

    default:
      return false;
  }
}

/** Unsettled requirements that are effectively due (PENDING or DUE, not yet paid/waived/canceled). */
export function getUnsettledEffectivelyDueRequirements(
  requirements: PaymentRequirementRow[],
  ctx: PaymentDueContext,
): PaymentRequirementRow[] {
  const ctxWithAll: PaymentDueContext = {
    ...ctx,
    allRequirements: requirements,
  };
  return requirements.filter(
    (r) =>
      !TERMINAL_STATUSES.includes(r.status) &&
      isPaymentEffectivelyDue(r, ctxWithAll),
  );
}

export type BuildPaymentDueContextJobInput = {
  status: string;
  stages: {
    id: string;
    sortOrder: number;
    stageId: string | null;
    title?: string;
    tasks: {
      status: JobTaskStatus;
      recoveryFlowId?: string | null;
    }[];
  }[];
  paymentRequirements: PaymentRequirementRow[];
};

/** Corrections stage title used at activation/recovery — excluded from main-path checks. */
export const CORRECTIONS_STAGE_NAME = "Corrections";

export function buildPaymentDueContextFromJob(job: BuildPaymentDueContextJobInput): PaymentDueContext {
  const orgStageIdToJobStageId: Record<string, string> = {};
  for (const stage of job.stages) {
    if (stage.stageId) {
      orgStageIdToJobStageId[stage.stageId] = stage.id;
    }
  }

  const stages: PaymentDueStageInfo[] = job.stages.map((stage) => {
    const nonRecoveryTasks = stage.tasks.filter((t) => !t.recoveryFlowId);
    const tasksForCompletion = nonRecoveryTasks.length > 0 ? nonRecoveryTasks : stage.tasks;
    const hasExecutionTasks = tasksForCompletion.length > 0;
    const nonCanceledTasks = tasksForCompletion.filter((t) => t.status !== JobTaskStatus.CANCELED);
    const hasNonCanceledTasks = nonCanceledTasks.length > 0;
    const allNonCanceledDone =
      hasNonCanceledTasks &&
      nonCanceledTasks.every((t) => t.status === JobTaskStatus.DONE);
    const allApplicableCanceled =
      hasExecutionTasks &&
      tasksForCompletion.every((t) => t.status === JobTaskStatus.CANCELED);
    const executionState: PaymentDueStageInfo["executionState"] = allNonCanceledDone
      ? "COMPLETED"
      : allApplicableCanceled
        ? "SKIPPED"
        : "OPEN";
    const isRecoveryStage =
      stage.title === CORRECTIONS_STAGE_NAME ||
      (stage.tasks.length > 0 && stage.tasks.every((t) => !!t.recoveryFlowId));

    return {
      id: stage.id,
      sortOrder: stage.sortOrder,
      executionState,
      isRecoveryStage,
    };
  });

  return {
    jobIsActive: job.status === "ACTIVE",
    stages,
    orgStageIdToJobStageId,
    allRequirements: job.paymentRequirements,
  };
}

export type TaskPaymentHold = {
  requirementId: string;
  title: string;
  reason: string;
} | null;

/**
 * Pick at most one payment hold relevant to a task's stage for display.
 * Returns the earliest effectively-due unsettled requirement that gates this stage.
 */
export function deriveTaskPaymentHold(
  taskJobStageId: string,
  requirements: PaymentRequirementRow[],
  ctx: PaymentDueContext,
): TaskPaymentHold {
  const due = getUnsettledEffectivelyDueRequirements(requirements, ctx);
  if (due.length === 0) return null;

  const sorted = [...due].sort((a, b) => {
    const aBefore = a.requiredBeforeStageId === taskJobStageId ? 0 : 1;
    const bBefore = b.requiredBeforeStageId === taskJobStageId ? 0 : 1;
    return aBefore - bBefore;
  });

  for (const req of sorted) {
    const anchor = req.sourcePaymentScheduleItem?.anchorType;

    if (req.requiredBeforeStageId === taskJobStageId) {
      return {
        requirementId: req.id,
        title: req.title,
        reason: "Payment required before work in this stage.",
      };
    }

    if (anchor === PaymentScheduleAnchorType.UPON_APPROVAL && isPaymentEffectivelyDue(req, ctx)) {
      return {
        requirementId: req.id,
        title: req.title,
        reason: "Deposit payment is required before continuing.",
      };
    }
  }

  const first = sorted[0];
  if (first && isPaymentEffectivelyDue(first, ctx)) {
    return {
      requirementId: first.id,
      title: first.title,
      reason: first.requiredBeforeStageId
        ? "Payment required before next stage."
        : "Required payment is due.",
    };
  }

  return null;
}

/** Promote PENDING requirements to DUE when gate conditions are met (idempotent). */
export async function promotePendingPaymentsToDue(
  jobId: string,
  tx: ExtendedTransactionClient = db,
): Promise<void> {
  const job = await tx.job.findFirst({
    where: { id: jobId },
    select: {
      status: true,
      stages: {
        select: {
          id: true,
          sortOrder: true,
          stageId: true,
          title: true,
          tasks: {
            select: { status: true, recoveryFlowId: true },
          },
        },
      },
      paymentRequirements: {
        select: {
          id: true,
          title: true,
          status: true,
          requiredBeforeStageId: true,
          sourcePaymentScheduleItemId: true,
        },
      },
    },
  });

  if (!job) return;

  const anchors = await loadScheduleAnchorsByIds(
    job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
    tx,
  );

  const enrichedRequirements = attachScheduleAnchorsToRequirements(
    job.paymentRequirements,
    anchors,
  );

  const ctx = buildPaymentDueContextFromJob({
    ...job,
    paymentRequirements: enrichedRequirements,
  });
  const pending = enrichedRequirements.filter(
    (r) => r.status === JobPaymentRequirementStatus.PENDING,
  );

  for (const req of pending) {
    if (isPaymentEffectivelyDue(req, ctx)) {
      await tx.jobPaymentRequirement.updateMany({
        where: { id: req.id, status: JobPaymentRequirementStatus.PENDING },
        data: { status: JobPaymentRequirementStatus.DUE },
      });
    }
  }
}
