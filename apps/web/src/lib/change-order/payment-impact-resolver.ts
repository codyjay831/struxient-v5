import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import type {
  ChangeOrderPaymentImpact,
  ChangeOrderPaymentImpactResolvedPreview,
  ChangeOrderPaymentStrategy,
} from "@/lib/change-order/payment-impact-schema";
import { CHANGE_ORDER_PAYMENT_STRATEGY_LABELS } from "@/lib/change-order/payment-impact-schema";
import { formatCents } from "@/lib/job-payment-display";

export type JobPaymentRequirementForResolver = {
  id: string;
  title: string;
  amountCents: number | null;
  status: JobPaymentRequirementStatus;
  sourcePaymentScheduleItemId: string | null;
  scheduleSortOrder: number | null;
  anchorType: PaymentScheduleAnchorType | null;
  createdAt: Date;
};

const SETTLED_STATUSES: JobPaymentRequirementStatus[] = [
  JobPaymentRequirementStatus.PAID,
  JobPaymentRequirementStatus.WAIVED,
  JobPaymentRequirementStatus.CANCELED,
];

export function isUnsettledPaymentRequirement(status: JobPaymentRequirementStatus): boolean {
  return !SETTLED_STATUSES.includes(status);
}

export function getUnsettledPaymentRequirements(
  requirements: JobPaymentRequirementForResolver[],
): JobPaymentRequirementForResolver[] {
  return requirements.filter((req) => isUnsettledPaymentRequirement(req.status));
}

function sortRequirementsForResolution(
  requirements: JobPaymentRequirementForResolver[],
): JobPaymentRequirementForResolver[] {
  return [...requirements].sort((a, b) => {
    const aSort = a.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function resolveNextUnpaidPaymentRequirement(
  requirements: JobPaymentRequirementForResolver[],
): JobPaymentRequirementForResolver | null {
  const unsettled = sortRequirementsForResolution(getUnsettledPaymentRequirements(requirements));
  return unsettled[0] ?? null;
}

export function resolveFinalUnpaidPaymentRequirement(
  requirements: JobPaymentRequirementForResolver[],
): JobPaymentRequirementForResolver | null {
  const unsettled = getUnsettledPaymentRequirements(requirements);
  const finalAnchored = unsettled.filter(
    (req) => req.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE,
  );
  if (finalAnchored.length > 0) {
    return sortRequirementsForResolution(finalAnchored).at(-1) ?? null;
  }
  return sortRequirementsForResolution(unsettled).at(-1) ?? null;
}

export function sumUnsettledPaymentBalanceCents(
  requirements: JobPaymentRequirementForResolver[],
): number {
  return getUnsettledPaymentRequirements(requirements).reduce(
    (sum, req) => sum + Math.max(0, req.amountCents ?? 0),
    0,
  );
}

export function suggestDefaultPaymentStrategy(params: {
  priceDeltaCents: number;
  requirements: JobPaymentRequirementForResolver[];
}): ChangeOrderPaymentStrategy {
  if (params.priceDeltaCents < 0) {
    return "CREDIT_REMAINING_BALANCE";
  }
  const unsettled = getUnsettledPaymentRequirements(params.requirements);
  if (unsettled.length === 0) {
    return "DUE_BEFORE_ADDED_WORK";
  }
  const finalTarget = resolveFinalUnpaidPaymentRequirement(params.requirements);
  const nextTarget = resolveNextUnpaidPaymentRequirement(params.requirements);
  if (
    finalTarget &&
    nextTarget &&
    finalTarget.id === nextTarget.id &&
    unsettled.length === 1
  ) {
    return "ADD_TO_FINAL_PAYMENT";
  }
  if (Math.abs(params.priceDeltaCents) >= 25_000) {
    return "DUE_BEFORE_ADDED_WORK";
  }
  return "ADD_TO_NEXT_UNPAID_PAYMENT";
}

function buildCustomerSummary(params: {
  strategy: ChangeOrderPaymentStrategy;
  priceDeltaCents: number;
  targetTitle: string | null;
}): { customerSummary: string; dueTimingLabel: string | null; blocksAddedWork: boolean } {
  const amountLabel = formatCents(Math.abs(params.priceDeltaCents));

  switch (params.strategy) {
    case "DUE_BEFORE_ADDED_WORK":
      return {
        customerSummary: `An additional ${amountLabel} is due before added work begins.`,
        dueTimingLabel: "Due before added work starts",
        blocksAddedWork: true,
      };
    case "ADD_TO_NEXT_UNPAID_PAYMENT":
      return {
        customerSummary: params.targetTitle
          ? `An additional ${amountLabel} will be added to your next payment (${params.targetTitle}).`
          : `An additional ${amountLabel} will be added to your next payment.`,
        dueTimingLabel: params.targetTitle ? `Added to ${params.targetTitle}` : "Added to next payment",
        blocksAddedWork: false,
      };
    case "ADD_TO_FINAL_PAYMENT":
      return {
        customerSummary: params.targetTitle
          ? `An additional ${amountLabel} will be added to your final payment (${params.targetTitle}).`
          : `An additional ${amountLabel} will be added to your final payment.`,
        dueTimingLabel: params.targetTitle ? `Added to ${params.targetTitle}` : "Added to final payment",
        blocksAddedWork: false,
      };
    case "CREDIT_REMAINING_BALANCE":
      return {
        customerSummary: `A credit of ${amountLabel} will reduce your remaining balance, applied to final payment first.`,
        dueTimingLabel: "Credit applied to remaining balance",
        blocksAddedWork: false,
      };
  }
}

export function buildPaymentImpactForStrategy(params: {
  strategy: ChangeOrderPaymentStrategy;
  priceDeltaCents: number;
  requirements: JobPaymentRequirementForResolver[];
  jobPlanVersion?: number;
  customerTermsTextOverride?: string;
  blocksAddedWorkOverride?: boolean;
}): { ok: true; impact: ChangeOrderPaymentImpact } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (params.priceDeltaCents === 0) {
    return { ok: false, errors: ["Zero-dollar Change Orders do not require payment impact."] };
  }

  if (params.priceDeltaCents < 0 && params.strategy !== "CREDIT_REMAINING_BALANCE") {
    errors.push("Negative price deltas must use the credit remaining balance strategy.");
  }
  if (params.priceDeltaCents > 0 && params.strategy === "CREDIT_REMAINING_BALANCE") {
    errors.push("Credit strategy requires a negative Change Order amount.");
  }

  let target: JobPaymentRequirementForResolver | null = null;
  if (params.strategy === "ADD_TO_NEXT_UNPAID_PAYMENT") {
    target = resolveNextUnpaidPaymentRequirement(params.requirements);
    if (!target) {
      errors.push("No unpaid payment requirement is available for the next payment strategy.");
    }
  } else if (params.strategy === "ADD_TO_FINAL_PAYMENT") {
    target = resolveFinalUnpaidPaymentRequirement(params.requirements);
    if (!target) {
      errors.push("No unpaid final payment requirement is available.");
    }
  } else if (params.strategy === "CREDIT_REMAINING_BALANCE") {
    const unsettledBalance = sumUnsettledPaymentBalanceCents(params.requirements);
    if (unsettledBalance <= 0) {
      errors.push("No unsettled payment balance is available to credit.");
    } else if (Math.abs(params.priceDeltaCents) > unsettledBalance) {
      errors.push(
        `Credit of ${formatCents(Math.abs(params.priceDeltaCents))} exceeds remaining unsettled balance of ${formatCents(unsettledBalance)}.`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const targetTitle = target?.title ?? null;
  const summaryParts = buildCustomerSummary({
    strategy: params.strategy,
    priceDeltaCents: params.priceDeltaCents,
    targetTitle,
  });

  const targetAmountBeforeCents = target?.amountCents ?? null;
  const targetAmountAfterCents =
    target && params.priceDeltaCents > 0
      ? (target.amountCents ?? 0) + params.priceDeltaCents
      : target && params.priceDeltaCents < 0
        ? Math.max(0, (target.amountCents ?? 0) + params.priceDeltaCents)
        : null;

  const resolvedPreview: ChangeOrderPaymentImpactResolvedPreview = {
    strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS[params.strategy],
    customerSummary: summaryParts.customerSummary,
    targetPaymentRequirementId: target?.id ?? null,
    targetPaymentTitle: targetTitle,
    targetAmountBeforeCents,
    targetAmountAfterCents,
    dueTimingLabel: summaryParts.dueTimingLabel,
    blocksAddedWork: params.blocksAddedWorkOverride ?? summaryParts.blocksAddedWork,
  };

  const impact: ChangeOrderPaymentImpact = {
    schemaVersion: 1,
    strategy: params.strategy,
    targetPaymentRequirementId: target?.id ?? undefined,
    customerTermsText:
      params.customerTermsTextOverride?.trim() || summaryParts.customerSummary,
    blocksAddedWork: resolvedPreview.blocksAddedWork,
    resolvedPreview,
    ...(params.jobPlanVersion != null
      ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
      : {}),
  };

  return { ok: true, impact };
}

export type PaymentImpactWarning = {
  code:
    | "MISSING_TARGET"
    | "TARGET_SETTLED"
    | "CREDIT_EXCEEDS_BALANCE"
    | "NO_UNSETTLED_PAYMENTS";
  message: string;
};

export function derivePaymentImpactWarnings(params: {
  priceDeltaCents: number;
  strategy: ChangeOrderPaymentStrategy | null;
  requirements: JobPaymentRequirementForResolver[];
  targetPaymentRequirementId?: string | null;
}): PaymentImpactWarning[] {
  if (params.priceDeltaCents === 0) return [];

  const warnings: PaymentImpactWarning[] = [];
  const unsettled = getUnsettledPaymentRequirements(params.requirements);

  if (unsettled.length === 0 && params.priceDeltaCents > 0) {
    warnings.push({
      code: "NO_UNSETTLED_PAYMENTS",
      message: "No unpaid payment requirements exist on this job. Due before added work is recommended.",
    });
  }

  if (
    params.strategy === "ADD_TO_NEXT_UNPAID_PAYMENT" ||
    params.strategy === "ADD_TO_FINAL_PAYMENT"
  ) {
    const target =
      params.strategy === "ADD_TO_NEXT_UNPAID_PAYMENT"
        ? resolveNextUnpaidPaymentRequirement(params.requirements)
        : resolveFinalUnpaidPaymentRequirement(params.requirements);
    if (!target) {
      warnings.push({
        code: "MISSING_TARGET",
        message: "No suitable unpaid payment requirement was found for this strategy.",
      });
    } else if (
      params.targetPaymentRequirementId &&
      params.targetPaymentRequirementId !== target.id
    ) {
      const selected = params.requirements.find((r) => r.id === params.targetPaymentRequirementId);
      if (selected && !isUnsettledPaymentRequirement(selected.status)) {
        warnings.push({
          code: "TARGET_SETTLED",
          message: `Selected payment "${selected.title}" is already paid, waived, or canceled.`,
        });
      }
    }
  }

  if (params.priceDeltaCents < 0) {
    const balance = sumUnsettledPaymentBalanceCents(params.requirements);
    if (Math.abs(params.priceDeltaCents) > balance) {
      warnings.push({
        code: "CREDIT_EXCEEDS_BALANCE",
        message: `Credit exceeds remaining unsettled balance of ${formatCents(balance)}.`,
      });
    }
  }

  return warnings;
}

export function paymentImpactToCustomerTerms(impact: ChangeOrderPaymentImpact): {
  customerSummary: string;
  customerTermsText: string;
  strategyLabel: string;
  dueTimingLabel: string | null;
  affectedPaymentTitle: string | null;
  targetAmountBeforeCents: number | null;
  targetAmountAfterCents: number | null;
  isCredit: boolean;
  dueBeforeAddedWork: boolean;
} {
  return {
    customerSummary: impact.resolvedPreview.customerSummary,
    customerTermsText: impact.customerTermsText,
    strategyLabel: impact.resolvedPreview.strategyLabel,
    dueTimingLabel: impact.resolvedPreview.dueTimingLabel ?? null,
    affectedPaymentTitle: impact.resolvedPreview.targetPaymentTitle ?? null,
    targetAmountBeforeCents: impact.resolvedPreview.targetAmountBeforeCents ?? null,
    targetAmountAfterCents: impact.resolvedPreview.targetAmountAfterCents ?? null,
    isCredit: impact.strategy === "CREDIT_REMAINING_BALANCE",
    dueBeforeAddedWork: impact.strategy === "DUE_BEFORE_ADDED_WORK",
  };
}

export const STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE =
  "This creates a due payment before the added work. Task blocking is not automatic yet.";

export function getStaffPaymentAfterApplySummary(params: {
  strategy: ChangeOrderPaymentStrategy;
  priceDeltaCents: number;
  targetTitle: string | null;
}): string {
  const amountLabel = formatCents(Math.abs(params.priceDeltaCents));
  switch (params.strategy) {
    case "DUE_BEFORE_ADDED_WORK":
      return `After apply, a ${amountLabel} due payment is added for this Change Order.`;
    case "ADD_TO_NEXT_UNPAID_PAYMENT":
      return params.targetTitle
        ? `After apply, ${amountLabel} is added to ${params.targetTitle}.`
        : `After apply, ${amountLabel} is added to the next unpaid payment on this job.`;
    case "ADD_TO_FINAL_PAYMENT":
      return params.targetTitle
        ? `After apply, ${amountLabel} is added to final payment (${params.targetTitle}).`
        : `After apply, ${amountLabel} is added to the final unpaid payment on this job.`;
    case "CREDIT_REMAINING_BALANCE":
      return `After apply, a ${amountLabel} credit reduces remaining unpaid balances, starting with final payment.`;
  }
}

export function humanizePaymentApplyError(message: string): string {
  if (/already paid|already waived|already canceled|is already .* and cannot be modified/i.test(message)) {
    return "The selected payment was already collected or closed after the customer accepted. Update payment terms in the commercial column, save, and review before applying again.";
  }
  if (/no longer matches the earliest unsettled payment/i.test(message)) {
    return "The next unpaid payment on this job changed after the customer accepted. Review payment terms and save commercial changes before applying again.";
  }
  if (/no longer matches the final unsettled payment/i.test(message)) {
    return "The final unpaid payment on this job changed after the customer accepted. Review payment terms and save commercial changes before applying again.";
  }
  if (/must not coexist with approved paymentImpactJson/i.test(message)) {
    return "This Change Order has conflicting payment instructions. Save approved payment terms in the commercial column and remove legacy payment operations.";
  }
  if (/Legacy execution payment ops are no longer accepted/i.test(message)) {
    return "Legacy payment instructions are no longer used. Choose and save approved payment terms in the commercial column.";
  }
  if (/payment strategy|paymentImpactJson|payment impact/i.test(message)) {
    return "Payment terms are missing or invalid. Choose how the customer will pay, save commercial changes, then send or apply.";
  }
  return message;
}
