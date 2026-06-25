import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import type {
  ChangeOrderPaymentAllocationBasis,
  ChangeOrderPaymentAllocationLinePreview,
  ChangeOrderPaymentAllocationRow,
  ChangeOrderPaymentImpactAny,
  ChangeOrderPaymentImpactV2,
  ChangeOrderPaymentStrategy,
} from "@/lib/change-order/payment-impact-schema";
import {
  CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
  CHANGE_ORDER_PAYMENT_STRATEGY_LABELS,
  isDepositStrategy,
  isPaymentImpactV2,
  validatePaymentImpactAllocationSum,
} from "@/lib/change-order/payment-impact-schema";
import {
  getAutoAllocationEligibleRequirements,
  isContractPlanPaymentRequirement,
  isUnsettledPaymentRequirement,
  resolveFinalUnpaidPaymentRequirement,
  resolveNextUnpaidPaymentRequirement,
  type JobPaymentRequirementForResolver,
} from "@/lib/change-order/payment-impact-resolver";
import { formatCents } from "@/lib/job-payment-display";

export type PaymentPlanPreset =
  | "DUE_BEFORE_ADDED_WORK"
  | "ADD_TO_NEXT_UNPAID_PAYMENT"
  | "ADD_TO_FINAL_PAYMENT"
  | "DEPOSIT_NOW_REST_TO_FINAL"
  | "SPLIT_ACROSS_REMAINING_PAYMENTS"
  | "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING"
  | "CREDIT_REMAINING_BALANCE";

const SPLIT_PRESETS: PaymentPlanPreset[] = [
  "SPLIT_ACROSS_REMAINING_PAYMENTS",
  "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
];

const DEPOSIT_PRESETS: PaymentPlanPreset[] = [
  "DEPOSIT_NOW_REST_TO_FINAL",
  "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
];

export function presetNeedsDeposit(preset: PaymentPlanPreset): boolean {
  return DEPOSIT_PRESETS.includes(preset);
}

export function presetNeedsBasis(preset: PaymentPlanPreset): boolean {
  return SPLIT_PRESETS.includes(preset);
}

export type PaymentPlanReviewRow = {
  paymentRequirementId: string;
  title: string;
  status: JobPaymentRequirementStatus;
  currentAmountCents: number;
  sourcePaymentScheduleItemId: string | null;
  schedulePercentage: number | null;
  anchorType: PaymentScheduleAnchorType | null;
  dueAnchorLabel: string | null;
  isContractPlanRow: boolean;
  /** @deprecated Use isAutoAllocationEligible */
  eligible: boolean;
  isAutoAllocationEligible: boolean;
  isCustomAllocationEligible: boolean;
  ineligibleReason: string | null;
  exclusionReason: string | null;
  adjustmentCents: number;
  newAmountCents: number;
};

export type PaymentPlanReviewModel = {
  priceDeltaCents: number;
  rows: PaymentPlanReviewRow[];
  /** Contract-plan unsettled rows eligible for automatic split. */
  contractPlanCount: number;
  /** Open payments visible but excluded from automatic split (prior CO / manual). */
  excludedOpenPaymentCount: number;
  /** @deprecated Use contractPlanCount */
  eligibleCount: number;
  unsettledTotalCents: number;
};

type ManualAllocationNewAmounts = Map<string, number>;

function formatAnchorLabel(params: {
  anchorType: PaymentScheduleAnchorType | null;
  requiredBeforeStageTitle: string | null;
}): string | null {
  if (params.requiredBeforeStageTitle) {
    return `Before: ${params.requiredBeforeStageTitle}`;
  }
  switch (params.anchorType) {
    case PaymentScheduleAnchorType.UPON_APPROVAL:
      return "Upon approval";
    case PaymentScheduleAnchorType.FINAL_BALANCE:
      return "Final balance";
    case PaymentScheduleAnchorType.BEFORE_STAGE:
      return "Before stage";
    case PaymentScheduleAnchorType.AFTER_STAGE:
      return "After stage";
    default:
      return null;
  }
}

function ineligibleReasonForStatus(status: JobPaymentRequirementStatus): string | null {
  switch (status) {
    case JobPaymentRequirementStatus.PAID:
      return "Already paid";
    case JobPaymentRequirementStatus.WAIVED:
      return "Waived";
    case JobPaymentRequirementStatus.CANCELED:
      return "Canceled";
    default:
      return null;
  }
}

function autoExclusionReason(req: JobPaymentRequirementForResolver): string | null {
  if (!isUnsettledPaymentRequirement(req.status)) {
    return null;
  }
  if (req.sourceChangeOrderId) {
    return "Prior Change Order payment";
  }
  if (!isContractPlanPaymentRequirement(req)) {
    return "Manual payment — not part of original contract plan";
  }
  return null;
}

export function buildPaymentPlanReviewModel(params: {
  priceDeltaCents: number;
  requirements: JobPaymentRequirementForResolver[];
  adjustments?: Map<string, number>;
}): PaymentPlanReviewModel {
  const adjustments = params.adjustments ?? new Map<string, number>();
  const sorted = [...params.requirements].sort((a, b) => {
    const aSort = a.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSort = b.scheduleSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let contractPlanCount = 0;
  let excludedOpenPaymentCount = 0;
  let unsettledTotalCents = 0;

  const rows: PaymentPlanReviewRow[] = sorted.map((req) => {
    const unsettled = isUnsettledPaymentRequirement(req.status);
    const isContractPlanRow = isContractPlanPaymentRequirement(req);
    const isAutoAllocationEligible = unsettled && isContractPlanRow;
    const isCustomAllocationEligible = isAutoAllocationEligible;
    const currentAmountCents = Math.max(0, req.amountCents ?? 0);
    if (unsettled) {
      unsettledTotalCents += currentAmountCents;
      if (isAutoAllocationEligible) {
        contractPlanCount += 1;
      } else {
        excludedOpenPaymentCount += 1;
      }
    }
    const adjustmentCents = adjustments.get(req.id) ?? 0;
    return {
      paymentRequirementId: req.id,
      title: req.title,
      status: req.status,
      currentAmountCents,
      sourcePaymentScheduleItemId: req.sourcePaymentScheduleItemId,
      schedulePercentage: req.schedulePercentage ?? null,
      anchorType: req.anchorType,
      dueAnchorLabel: formatAnchorLabel({
        anchorType: req.anchorType,
        requiredBeforeStageTitle: req.requiredBeforeStageTitle ?? null,
      }),
      isContractPlanRow,
      eligible: isAutoAllocationEligible,
      isAutoAllocationEligible,
      isCustomAllocationEligible,
      ineligibleReason: unsettled ? null : ineligibleReasonForStatus(req.status),
      exclusionReason: autoExclusionReason(req),
      adjustmentCents,
      newAmountCents: currentAmountCents + adjustmentCents,
    };
  });

  return {
    priceDeltaCents: params.priceDeltaCents,
    rows,
    contractPlanCount,
    excludedOpenPaymentCount,
    eligibleCount: contractPlanCount,
    unsettledTotalCents,
  };
}

export function distributeCentsByWeights(totalCents: number, weights: number[]): number[] {
  if (totalCents <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const raw = weights.map((w) => Math.floor((totalCents * w) / totalWeight));
  const allocated = raw.reduce((sum, v) => sum + v, 0);
  const remainder = totalCents - allocated;
  const result = [...raw];
  const lastIndex = result.length - 1;
  result[lastIndex] = (result[lastIndex] ?? 0) + remainder;
  return result;
}

function buildAllocationRowsFromAdjustments(
  eligible: JobPaymentRequirementForResolver[],
  adjustments: number[],
): ChangeOrderPaymentAllocationRow[] {
  return eligible.map((req, index) => {
    const currentAmountCents = Math.max(0, req.amountCents ?? 0);
    const adjustmentCents = adjustments[index] ?? 0;
    return {
      paymentRequirementId: req.id,
      title: req.title,
      statusAtApproval: req.status,
      currentAmountCents,
      adjustmentCents,
      newAmountCents: currentAmountCents + adjustmentCents,
      sourcePaymentScheduleItemId: req.sourcePaymentScheduleItemId,
      schedulePercentage: req.schedulePercentage ?? null,
    };
  });
}

export function allocateByOriginalPaymentPercentages(params: {
  totalCents: number;
  eligible: JobPaymentRequirementForResolver[];
}): {
  adjustments: number[];
  basisUsed: ChangeOrderPaymentAllocationBasis;
  basisFallback: ChangeOrderPaymentAllocationBasis | null;
} {
  const scheduleBacked = params.eligible.filter(
    (row) =>
      row.sourcePaymentScheduleItemId != null &&
      row.schedulePercentage != null &&
      row.schedulePercentage > 0,
  );
  const hasFullCoverage =
    params.eligible.length > 0 && scheduleBacked.length === params.eligible.length;
  if (!hasFullCoverage) {
    const fallback = allocateByCurrentRemainingAmounts(params);
    return {
      adjustments: fallback.adjustments,
      basisUsed: "CURRENT_REMAINING_AMOUNTS",
      basisFallback: "CURRENT_REMAINING_AMOUNTS",
    };
  }

  const percentages = scheduleBacked.map((row) => row.schedulePercentage ?? 0);
  const hasPercentages = percentages.some((p) => p > 0);
  if (!hasPercentages) {
    const fallback = allocateByCurrentRemainingAmounts(params);
    return {
      adjustments: fallback.adjustments,
      basisUsed: "CURRENT_REMAINING_AMOUNTS",
      basisFallback: "CURRENT_REMAINING_AMOUNTS",
    };
  }

  return {
    adjustments: distributeCentsByWeights(params.totalCents, percentages),
    basisUsed: "ORIGINAL_PAYMENT_PERCENTAGES",
    basisFallback: null,
  };
}

export function allocateByCurrentRemainingAmounts(params: {
  totalCents: number;
  eligible: JobPaymentRequirementForResolver[];
}): { adjustments: number[]; basisUsed: ChangeOrderPaymentAllocationBasis } {
  const weights = params.eligible.map((r) => Math.max(0, r.amountCents ?? 0));
  return {
    adjustments: distributeCentsByWeights(params.totalCents, weights),
    basisUsed: "CURRENT_REMAINING_AMOUNTS",
  };
}

export function allocateEqualSplit(params: {
  totalCents: number;
  eligible: JobPaymentRequirementForResolver[];
}): { adjustments: number[]; basisUsed: ChangeOrderPaymentAllocationBasis } {
  const weights = params.eligible.map(() => 1);
  return {
    adjustments: distributeCentsByWeights(params.totalCents, weights),
    basisUsed: "EQUAL_SPLIT",
  };
}

export function allocateByBasis(params: {
  totalCents: number;
  eligible: JobPaymentRequirementForResolver[];
  basis: ChangeOrderPaymentAllocationBasis;
}): {
  adjustments: number[];
  basisUsed: ChangeOrderPaymentAllocationBasis;
  basisFallback: ChangeOrderPaymentAllocationBasis | null;
} {
  switch (params.basis) {
    case "ORIGINAL_PAYMENT_PERCENTAGES":
      return allocateByOriginalPaymentPercentages(params);
    case "CURRENT_REMAINING_AMOUNTS":
      return { ...allocateByCurrentRemainingAmounts(params), basisFallback: null };
    case "EQUAL_SPLIT":
      return { ...allocateEqualSplit(params), basisFallback: null };
    case "MANUAL":
      return {
        adjustments: allocateByCurrentRemainingAmounts(params).adjustments,
        basisUsed: "MANUAL",
        basisFallback: null,
      };
  }
}

function allocationLinesFromRows(
  rows: ChangeOrderPaymentAllocationRow[],
): ChangeOrderPaymentAllocationLinePreview[] {
  return rows
    .filter((row) => row.adjustmentCents !== 0)
    .map((row) => ({
      title: row.title,
      currentAmountCents: row.currentAmountCents,
      adjustmentCents: row.adjustmentCents,
      newAmountCents: row.newAmountCents,
    }));
}

export function buildManualAllocationRowsFromReviewModel(params: {
  reviewModel: PaymentPlanReviewModel;
  manualNewAmountsById: ManualAllocationNewAmounts;
}): { allocations: ChangeOrderPaymentAllocationRow[]; errors: string[] } {
  const errors: string[] = [];
  const allocations: ChangeOrderPaymentAllocationRow[] = [];

  for (const row of params.reviewModel.rows) {
    const hasManualEdit = params.manualNewAmountsById.has(row.paymentRequirementId);
    const nextAmount = hasManualEdit
      ? Math.round(params.manualNewAmountsById.get(row.paymentRequirementId) ?? row.newAmountCents)
      : row.newAmountCents;

    if (hasManualEdit && !row.isCustomAllocationEligible) {
      errors.push(`Payment "${row.title}" cannot be adjusted.`);
    }
    if (nextAmount < 0) {
      errors.push(`Payment "${row.title}" would have a negative amount.`);
    }

    const adjustmentCents = nextAmount - row.currentAmountCents;
    allocations.push({
      paymentRequirementId: row.paymentRequirementId,
      title: row.title,
      statusAtApproval: row.status,
      currentAmountCents: row.currentAmountCents,
      adjustmentCents,
      newAmountCents: nextAmount,
      sourcePaymentScheduleItemId: row.sourcePaymentScheduleItemId,
      schedulePercentage: row.schedulePercentage,
    });
  }

  const adjustedIds = allocations
    .filter((row) => row.adjustmentCents !== 0)
    .map((row) => row.paymentRequirementId);
  if (new Set(adjustedIds).size !== adjustedIds.length) {
    errors.push("Duplicate payment requirement targets are not allowed.");
  }

  return { allocations, errors };
}

export function buildManualImpactFromPresetImpact(params: {
  baseImpact: ChangeOrderPaymentImpactV2;
  preset: PaymentPlanPreset;
  priceDeltaCents: number;
  reviewModel: PaymentPlanReviewModel;
  manualNewAmountsById: ManualAllocationNewAmounts;
}): { ok: true; impact: ChangeOrderPaymentImpactV2 } | { ok: false; errors: string[] } {
  const { allocations, errors } = buildManualAllocationRowsFromReviewModel({
    reviewModel: params.reviewModel,
    manualNewAmountsById: params.manualNewAmountsById,
  });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const baseBasis = params.baseImpact.allocationBasis;
  const withManual: ChangeOrderPaymentImpactV2 = {
    ...params.baseImpact,
    allocationBasis: "MANUAL",
    originPreset: params.baseImpact.originPreset ?? params.preset,
    originAllocationBasis:
      params.baseImpact.originAllocationBasis ??
      (baseBasis && baseBasis !== "MANUAL" ? baseBasis : undefined),
    allocations,
  };

  const targetAllocation =
    withManual.targetPaymentRequirementId != null
      ? allocations.find((row) => row.paymentRequirementId === withManual.targetPaymentRequirementId)
      : allocations.find((row) => row.adjustmentCents !== 0) ?? null;
  const terms = generateCustomerTermsFromImpact({
    strategy: withManual.strategy,
    priceDeltaCents: params.priceDeltaCents,
    initialPayment: withManual.initialPayment ?? null,
    allocationLines: allocationLinesFromRows(allocations),
    targetTitle: targetAllocation?.title ?? withManual.resolvedPreview.targetPaymentTitle ?? null,
    targetBefore: targetAllocation?.currentAmountCents ?? withManual.resolvedPreview.targetAmountBeforeCents ?? null,
    targetAfter: targetAllocation?.newAmountCents ?? withManual.resolvedPreview.targetAmountAfterCents ?? null,
  });
  withManual.customerTermsText = terms.customerTermsText;
  withManual.resolvedPreview = {
    ...withManual.resolvedPreview,
    customerSummary: terms.customerSummary,
    allocationLines: allocationLinesFromRows(allocations),
    targetPaymentTitle:
      targetAllocation?.title ?? withManual.resolvedPreview.targetPaymentTitle ?? null,
    targetAmountBeforeCents:
      targetAllocation?.currentAmountCents ??
      withManual.resolvedPreview.targetAmountBeforeCents ??
      null,
    targetAmountAfterCents:
      targetAllocation?.newAmountCents ?? withManual.resolvedPreview.targetAmountAfterCents ?? null,
    adjustmentTotalCents: params.priceDeltaCents,
    depositAmountCents: isDepositStrategy(withManual.strategy)
      ? (withManual.initialPayment?.amountCents ?? 0)
      : (withManual.resolvedPreview.depositAmountCents ?? null),
  };

  const sumErrors = validatePaymentImpactAllocationSum({
    priceDeltaCents: params.priceDeltaCents,
    impact: withManual,
  });
  if (sumErrors.length > 0) {
    return { ok: false, errors: sumErrors };
  }

  return { ok: true, impact: withManual };
}

export function generateCustomerTermsFromImpact(params: {
  strategy: ChangeOrderPaymentStrategy;
  priceDeltaCents: number;
  initialPayment?: { amountCents: number; title: string } | null;
  allocationLines: ChangeOrderPaymentAllocationLinePreview[];
  targetTitle?: string | null;
  targetBefore?: number | null;
  targetAfter?: number | null;
}): { customerSummary: string; customerTermsText: string } {
  const amountLabel = formatCents(params.priceDeltaCents);
  const lines: string[] = [];

  switch (params.strategy) {
    case "DUE_BEFORE_ADDED_WORK":
      return {
        customerSummary: `An additional ${amountLabel} is due before added work begins.`,
        customerTermsText: `An additional ${amountLabel} is due before added work begins.`,
      };
    case "ADD_TO_NEXT_UNPAID_PAYMENT":
    case "ADD_TO_FINAL_PAYMENT": {
      const targetLine =
        params.targetTitle && params.targetBefore != null && params.targetAfter != null
          ? `${params.targetTitle}: ${formatCents(params.targetBefore)} → ${formatCents(params.targetAfter)}`
          : null;
      const summary = params.targetTitle
        ? `An additional ${amountLabel} will be added to ${params.targetTitle}.`
        : `An additional ${amountLabel} will be added to your payment plan.`;
      return {
        customerSummary: summary,
        customerTermsText: targetLine ? `${summary} ${targetLine}` : summary,
      };
    }
    case "CREDIT_REMAINING_BALANCE":
      return {
        customerSummary: `A credit of ${formatCents(Math.abs(params.priceDeltaCents))} will reduce your remaining balance, applied to final payment first.`,
        customerTermsText: `A credit of ${formatCents(Math.abs(params.priceDeltaCents))} will reduce your remaining balance, applied to final payment first.`,
      };
    case "SPLIT_ACROSS_REMAINING_PAYMENTS": {
      const summary = `The additional ${amountLabel} will be spread across your remaining unpaid payments.`;
      for (const line of params.allocationLines) {
        lines.push(
          `${line.title}: ${formatCents(line.currentAmountCents)} → ${formatCents(line.newAmountCents)}`,
        );
      }
      return {
        customerSummary: summary,
        customerTermsText: lines.length > 0 ? `${summary} ${lines.join(" ")}` : summary,
      };
    }
    case "DEPOSIT_NOW_REST_TO_FINAL": {
      const deposit = params.initialPayment?.amountCents ?? 0;
      const depositLabel = formatCents(deposit);
      const summary = `A deposit of ${depositLabel} is due before added work starts. The remaining ${formatCents(params.priceDeltaCents - deposit)} will be added to your final payment.`;
      for (const line of params.allocationLines) {
        lines.push(
          `${line.title}: ${formatCents(line.currentAmountCents)} → ${formatCents(line.newAmountCents)}`,
        );
      }
      return {
        customerSummary: summary,
        customerTermsText: lines.length > 0 ? `${summary} ${lines.join(" ")}` : summary,
      };
    }
    case "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING": {
      const deposit = params.initialPayment?.amountCents ?? 0;
      const depositLabel = formatCents(deposit);
      const summary = `A deposit of ${depositLabel} is due before added work starts. The remaining ${formatCents(params.priceDeltaCents - deposit)} will be spread across your remaining unpaid payments.`;
      for (const line of params.allocationLines) {
        lines.push(
          `${line.title}: ${formatCents(line.currentAmountCents)} → ${formatCents(line.newAmountCents)}`,
        );
      }
      return {
        customerSummary: summary,
        customerTermsText: lines.length > 0 ? `${summary} ${lines.join(" ")}` : summary,
      };
    }
  }
}

function formatDepositTitle(changeOrderNumber?: number): string {
  if (changeOrderNumber != null) {
    return `Change Order CO-${String(changeOrderNumber).padStart(3, "0")} — Deposit`;
  }
  return "Change Order deposit";
}

export function buildImpactForPreset(params: {
  preset: PaymentPlanPreset;
  priceDeltaCents: number;
  requirements: JobPaymentRequirementForResolver[];
  jobPlanVersion?: number;
  depositCents?: number;
  allocationBasis?: ChangeOrderPaymentAllocationBasis;
  changeOrderNumber?: number;
}):
  | { ok: true; impact: ChangeOrderPaymentImpactV2 }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (params.priceDeltaCents === 0) {
    return { ok: false, errors: ["Zero-dollar Change Orders do not require payment impact."] };
  }

  const eligible = getAutoAllocationEligibleRequirements(params.requirements);

  if (params.preset === "CREDIT_REMAINING_BALANCE") {
    if (params.priceDeltaCents >= 0) {
      return { ok: false, errors: ["Credit strategy requires a negative Change Order amount."] };
    }
    const terms = generateCustomerTermsFromImpact({
      strategy: "CREDIT_REMAINING_BALANCE",
      priceDeltaCents: params.priceDeltaCents,
      allocationLines: [],
    });
    const impact: ChangeOrderPaymentImpactV2 = {
      schemaVersion: CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
      strategy: "CREDIT_REMAINING_BALANCE",
      customerTermsText: terms.customerTermsText,
      resolvedPreview: {
        strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.CREDIT_REMAINING_BALANCE,
        customerSummary: terms.customerSummary,
        dueTimingLabel: "Credit applied to remaining balance",
        adjustmentTotalCents: params.priceDeltaCents,
      },
      ...(params.jobPlanVersion != null
        ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
        : {}),
    };
    return { ok: true, impact };
  }

  if (params.priceDeltaCents <= 0) {
    return { ok: false, errors: ["Positive payment presets require a positive Change Order amount."] };
  }

  if (presetNeedsDeposit(params.preset)) {
    const deposit = params.depositCents ?? 0;
    if (deposit <= 0 || deposit > params.priceDeltaCents) {
      return {
        ok: false,
        errors: ["Deposit must be greater than 0 and less than or equal to the Change Order amount."],
      };
    }
    if (deposit === params.priceDeltaCents) {
      return buildImpactForPreset({
        ...params,
        preset: "DUE_BEFORE_ADDED_WORK",
      });
    }
  }

  if (params.preset === "DUE_BEFORE_ADDED_WORK") {
    const terms = generateCustomerTermsFromImpact({
      strategy: "DUE_BEFORE_ADDED_WORK",
      priceDeltaCents: params.priceDeltaCents,
      allocationLines: [],
    });
    const impact: ChangeOrderPaymentImpactV2 = {
      schemaVersion: CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
      strategy: "DUE_BEFORE_ADDED_WORK",
      customerTermsText: terms.customerTermsText,
      blocksAddedWork: true,
      resolvedPreview: {
        strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.DUE_BEFORE_ADDED_WORK,
        customerSummary: terms.customerSummary,
        dueTimingLabel: "Due before added work starts",
        blocksAddedWork: true,
        adjustmentTotalCents: params.priceDeltaCents,
        depositAmountCents: params.priceDeltaCents,
        depositDueLabel: "Due before added work starts",
      },
      ...(params.jobPlanVersion != null
        ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
        : {}),
    };
    return { ok: true, impact };
  }

  if (eligible.length === 0) {
    return buildImpactForPreset({
      ...params,
      preset: "DUE_BEFORE_ADDED_WORK",
    });
  }

  switch (params.preset) {
    case "ADD_TO_NEXT_UNPAID_PAYMENT": {
      const target = resolveNextUnpaidPaymentRequirement(params.requirements);
      if (!target) {
        return buildImpactForPreset({
          ...params,
          preset: "DUE_BEFORE_ADDED_WORK",
        });
      }
      const current = Math.max(0, target.amountCents ?? 0);
      const allocation: ChangeOrderPaymentAllocationRow = {
        paymentRequirementId: target.id,
        title: target.title,
        statusAtApproval: target.status,
        currentAmountCents: current,
        adjustmentCents: params.priceDeltaCents,
        newAmountCents: current + params.priceDeltaCents,
        sourcePaymentScheduleItemId: target.sourcePaymentScheduleItemId,
        schedulePercentage: target.schedulePercentage ?? null,
      };
      const terms = generateCustomerTermsFromImpact({
        strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
        priceDeltaCents: params.priceDeltaCents,
        allocationLines: allocationLinesFromRows([allocation]),
        targetTitle: target.title,
        targetBefore: current,
        targetAfter: allocation.newAmountCents,
      });
      return {
        ok: true,
        impact: {
          schemaVersion: CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
          strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
          targetPaymentRequirementId: target.id,
          customerTermsText: terms.customerTermsText,
          allocations: [allocation],
          resolvedPreview: {
            strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.ADD_TO_NEXT_UNPAID_PAYMENT,
            customerSummary: terms.customerSummary,
            targetPaymentRequirementId: target.id,
            targetPaymentTitle: target.title,
            targetAmountBeforeCents: current,
            targetAmountAfterCents: allocation.newAmountCents,
            dueTimingLabel: `Added to ${target.title}`,
            adjustmentTotalCents: params.priceDeltaCents,
            allocationLines: allocationLinesFromRows([allocation]),
          },
          ...(params.jobPlanVersion != null
            ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
            : {}),
        },
      };
    }
    case "ADD_TO_FINAL_PAYMENT": {
      const target = resolveFinalUnpaidPaymentRequirement(params.requirements);
      if (!target) {
        return buildImpactForPreset({
          ...params,
          preset: "DUE_BEFORE_ADDED_WORK",
        });
      }
      const current = Math.max(0, target.amountCents ?? 0);
      const allocation: ChangeOrderPaymentAllocationRow = {
        paymentRequirementId: target.id,
        title: target.title,
        statusAtApproval: target.status,
        currentAmountCents: current,
        adjustmentCents: params.priceDeltaCents,
        newAmountCents: current + params.priceDeltaCents,
        sourcePaymentScheduleItemId: target.sourcePaymentScheduleItemId,
        schedulePercentage: target.schedulePercentage ?? null,
      };
      const terms = generateCustomerTermsFromImpact({
        strategy: "ADD_TO_FINAL_PAYMENT",
        priceDeltaCents: params.priceDeltaCents,
        allocationLines: allocationLinesFromRows([allocation]),
        targetTitle: target.title,
        targetBefore: current,
        targetAfter: allocation.newAmountCents,
      });
      return {
        ok: true,
        impact: {
          schemaVersion: CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
          strategy: "ADD_TO_FINAL_PAYMENT",
          targetPaymentRequirementId: target.id,
          customerTermsText: terms.customerTermsText,
          allocations: [allocation],
          resolvedPreview: {
            strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.ADD_TO_FINAL_PAYMENT,
            customerSummary: terms.customerSummary,
            targetPaymentRequirementId: target.id,
            targetPaymentTitle: target.title,
            targetAmountBeforeCents: current,
            targetAmountAfterCents: allocation.newAmountCents,
            dueTimingLabel: `Added to ${target.title}`,
            adjustmentTotalCents: params.priceDeltaCents,
            allocationLines: allocationLinesFromRows([allocation]),
          },
          ...(params.jobPlanVersion != null
            ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
            : {}),
        },
      };
    }
    case "DEPOSIT_NOW_REST_TO_FINAL": {
      const depositCents = params.depositCents ?? 0;
      const finalTarget = resolveFinalUnpaidPaymentRequirement(params.requirements);
      if (!finalTarget) {
        return buildImpactForPreset({
          ...params,
          preset: "DUE_BEFORE_ADDED_WORK",
        });
      }
      const remainder = params.priceDeltaCents - depositCents;
      const current = Math.max(0, finalTarget.amountCents ?? 0);
      const allocation: ChangeOrderPaymentAllocationRow = {
        paymentRequirementId: finalTarget.id,
        title: finalTarget.title,
        statusAtApproval: finalTarget.status,
        currentAmountCents: current,
        adjustmentCents: remainder,
        newAmountCents: current + remainder,
        sourcePaymentScheduleItemId: finalTarget.sourcePaymentScheduleItemId,
        schedulePercentage: finalTarget.schedulePercentage ?? null,
      };
      const initialPayment = {
        amountCents: depositCents,
        title: formatDepositTitle(params.changeOrderNumber),
        dueTiming: "BEFORE_ADDED_WORK" as const,
        createsDueRequirement: true as const,
      };
      const terms = generateCustomerTermsFromImpact({
        strategy: "DEPOSIT_NOW_REST_TO_FINAL",
        priceDeltaCents: params.priceDeltaCents,
        initialPayment,
        allocationLines: allocationLinesFromRows([allocation]),
      });
      return {
        ok: true,
        impact: {
          schemaVersion: CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
          strategy: "DEPOSIT_NOW_REST_TO_FINAL",
          customerTermsText: terms.customerTermsText,
          blocksAddedWork: true,
          initialPayment,
          allocations: [allocation],
          resolvedPreview: {
            strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.DEPOSIT_NOW_REST_TO_FINAL,
            customerSummary: terms.customerSummary,
            dueTimingLabel: "Deposit due before added work; remainder on final payment",
            blocksAddedWork: true,
            adjustmentTotalCents: params.priceDeltaCents,
            allocationLines: allocationLinesFromRows([allocation]),
            depositAmountCents: depositCents,
            depositDueLabel: "Due before added work starts",
            targetPaymentTitle: finalTarget.title,
            targetAmountBeforeCents: current,
            targetAmountAfterCents: allocation.newAmountCents,
          },
          ...(params.jobPlanVersion != null
            ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
            : {}),
        },
      };
    }
    case "SPLIT_ACROSS_REMAINING_PAYMENTS":
    case "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING": {
      const basis = params.allocationBasis ?? "ORIGINAL_PAYMENT_PERCENTAGES";
      if (params.preset === "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING") {
        // deposit validated above
      }

      const splitTotal = params.priceDeltaCents - (params.depositCents ?? 0);
      if (splitTotal <= 0) {
        return buildImpactForPreset({
          ...params,
          preset: "DUE_BEFORE_ADDED_WORK",
        });
      }

      if (eligible.length === 0) {
        return buildImpactForPreset({
          ...params,
          preset: "DUE_BEFORE_ADDED_WORK",
        });
      }

      const allocated = allocateByBasis({
        totalCents: splitTotal,
        eligible,
        basis,
      });
      const allocations = buildAllocationRowsFromAdjustments(eligible, allocated.adjustments);
      const depositCents = params.depositCents ?? 0;
      const initialPayment =
        depositCents > 0
          ? {
              amountCents: depositCents,
              title: formatDepositTitle(params.changeOrderNumber),
              dueTiming: "BEFORE_ADDED_WORK" as const,
              createsDueRequirement: true as const,
            }
          : undefined;

      const strategy =
        params.preset === "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING"
          ? "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING"
          : "SPLIT_ACROSS_REMAINING_PAYMENTS";

      const terms = generateCustomerTermsFromImpact({
        strategy,
        priceDeltaCents: params.priceDeltaCents,
        initialPayment: initialPayment ?? null,
        allocationLines: allocationLinesFromRows(allocations),
      });

      const impact: ChangeOrderPaymentImpactV2 = {
        schemaVersion: CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
        strategy,
        customerTermsText: terms.customerTermsText,
        blocksAddedWork: depositCents > 0,
        allocationBasis: allocated.basisUsed,
        ...(allocated.basisFallback
          ? { allocationBasisFallback: allocated.basisFallback }
          : {}),
        ...(initialPayment ? { initialPayment } : {}),
        allocations,
        resolvedPreview: {
          strategyLabel: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS[strategy],
          customerSummary: terms.customerSummary,
          dueTimingLabel:
            depositCents > 0
              ? "Deposit due before added work; remainder spread across payments"
              : "Spread across remaining unpaid payments",
          blocksAddedWork: depositCents > 0,
          adjustmentTotalCents: params.priceDeltaCents,
          allocationLines: allocationLinesFromRows(allocations),
          depositAmountCents: depositCents > 0 ? depositCents : null,
          depositDueLabel: depositCents > 0 ? "Due before added work starts" : null,
        },
        ...(params.jobPlanVersion != null
          ? { resolvedAtSendJobPlanVersion: params.jobPlanVersion }
          : {}),
      };

      const sumErrors = validatePaymentImpactAllocationSum({
        priceDeltaCents: params.priceDeltaCents,
        impact,
      });
      if (sumErrors.length > 0) {
        return { ok: false, errors: sumErrors };
      }
      return { ok: true, impact };
    }
    default:
      errors.push(`Unsupported preset: ${params.preset}`);
      return { ok: false, errors };
  }
}

export function reviewModelFromImpact(params: {
  priceDeltaCents: number;
  requirements: JobPaymentRequirementForResolver[];
  impact: ChangeOrderPaymentImpactAny | null;
}): PaymentPlanReviewModel {
  const adjustments = new Map<string, number>();
  if (params.impact && "allocations" in params.impact && params.impact.allocations) {
    for (const row of params.impact.allocations) {
      adjustments.set(row.paymentRequirementId, row.adjustmentCents);
    }
  } else if (params.impact?.targetPaymentRequirementId && params.priceDeltaCents !== 0) {
    adjustments.set(params.impact.targetPaymentRequirementId, params.priceDeltaCents);
  }
  return buildPaymentPlanReviewModel({
    priceDeltaCents: params.priceDeltaCents,
    requirements: params.requirements,
    adjustments,
  });
}

export const PAYMENT_PLAN_PRESET_LABELS: Record<PaymentPlanPreset, string> = {
  DUE_BEFORE_ADDED_WORK: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.DUE_BEFORE_ADDED_WORK,
  ADD_TO_NEXT_UNPAID_PAYMENT: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.ADD_TO_NEXT_UNPAID_PAYMENT,
  ADD_TO_FINAL_PAYMENT: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.ADD_TO_FINAL_PAYMENT,
  DEPOSIT_NOW_REST_TO_FINAL: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.DEPOSIT_NOW_REST_TO_FINAL,
  SPLIT_ACROSS_REMAINING_PAYMENTS:
    CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.SPLIT_ACROSS_REMAINING_PAYMENTS,
  DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING:
    CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING,
  CREDIT_REMAINING_BALANCE: CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.CREDIT_REMAINING_BALANCE,
};

export function presetsForPriceDelta(priceDeltaCents: number): PaymentPlanPreset[] {
  if (priceDeltaCents < 0) {
    return ["CREDIT_REMAINING_BALANCE"];
  }
  if (priceDeltaCents > 0) {
    return [
      "DUE_BEFORE_ADDED_WORK",
      "ADD_TO_NEXT_UNPAID_PAYMENT",
      "ADD_TO_FINAL_PAYMENT",
      "DEPOSIT_NOW_REST_TO_FINAL",
      "SPLIT_ACROSS_REMAINING_PAYMENTS",
      "DEPOSIT_NOW_REST_SPLIT_ACROSS_REMAINING",
    ];
  }
  return [];
}

const AUTOMATIC_ALLOCATION_BASIS_STAFF_LABELS: Record<
  Exclude<ChangeOrderPaymentAllocationBasis, "MANUAL">,
  string
> = {
  ORIGINAL_PAYMENT_PERCENTAGES: "Original contract percentages",
  CURRENT_REMAINING_AMOUNTS: "Current unpaid balances",
  EQUAL_SPLIT: "Equal split",
};

export function formatCustomAllocationOriginLabel(params: {
  originPreset?: ChangeOrderPaymentStrategy | PaymentPlanPreset | null;
  originAllocationBasis?: ChangeOrderPaymentAllocationBasis | null;
}): string {
  if (
    params.originAllocationBasis &&
    params.originAllocationBasis !== "MANUAL" &&
    params.originAllocationBasis in AUTOMATIC_ALLOCATION_BASIS_STAFF_LABELS
  ) {
    return AUTOMATIC_ALLOCATION_BASIS_STAFF_LABELS[params.originAllocationBasis];
  }
  if (params.originPreset && params.originPreset in PAYMENT_PLAN_PRESET_LABELS) {
    return PAYMENT_PLAN_PRESET_LABELS[params.originPreset as PaymentPlanPreset];
  }
  if (params.originPreset && params.originPreset in CHANGE_ORDER_PAYMENT_STRATEGY_LABELS) {
    return CHANGE_ORDER_PAYMENT_STRATEGY_LABELS[params.originPreset];
  }
  return "Selected payment plan";
}

export function getCustomAllocationStaffNote(impact: ChangeOrderPaymentImpactV2): string {
  const origin = formatCustomAllocationOriginLabel({
    originPreset: impact.originPreset,
    originAllocationBasis: impact.originAllocationBasis,
  });
  return `Started from ${origin}. Amounts were adjusted manually.`;
}

export function isManualPaymentAllocation(
  impact: ChangeOrderPaymentImpactAny | null,
): impact is ChangeOrderPaymentImpactV2 {
  return impact != null && isPaymentImpactV2(impact) && impact.allocationBasis === "MANUAL";
}
