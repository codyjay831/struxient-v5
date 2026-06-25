import assert from "node:assert/strict";
import test from "node:test";
import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import {
  allocateByOriginalPaymentPercentages,
  allocateEqualSplit,
  buildManualImpactFromPresetImpact,
  buildImpactForPreset,
  buildPaymentPlanReviewModel,
  distributeCentsByWeights,
  formatCustomAllocationOriginLabel,
  generateCustomerTermsFromImpact,
  getCustomAllocationStaffNote,
  isManualPaymentAllocation,
} from "@/lib/change-order/payment-impact-allocation";
import type { JobPaymentRequirementForResolver } from "@/lib/change-order/payment-impact-resolver";
import {
  buildPaymentImpactForStrategy,
  derivePaymentImpactWarnings,
  resolveFinalUnpaidPaymentRequirement,
  resolveNextUnpaidPaymentRequirement,
} from "@/lib/change-order/payment-impact-resolver";
import {
  CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2,
  parseChangeOrderPaymentImpact,
  validatePaymentImpactAllocationSum,
} from "@/lib/change-order/payment-impact-schema";
import { validatePaymentImpactForMaterialization } from "@/lib/change-order/payment-impact-materializer";

function requirement(
  overrides: Partial<JobPaymentRequirementForResolver> & Pick<JobPaymentRequirementForResolver, "id">,
): JobPaymentRequirementForResolver {
  return {
    title: "Payment",
    amountCents: 100_000,
    status: JobPaymentRequirementStatus.PENDING,
    sourcePaymentScheduleItemId: "sched-default",
    sourceChangeOrderId: null,
    scheduleSortOrder: 0,
    anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
    schedulePercentage: 50,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("distributeCentsByWeights puts remainder on last row", () => {
  const result = distributeCentsByWeights(10_000, [33, 33, 34]);
  assert.equal(result.reduce((s, v) => s + v, 0), 10_000);
  assert.equal(result[2], 10_000 - result[0] - result[1]);
});

test("allocateByOriginalPaymentPercentages falls back when no percentages on contract rows", () => {
  const eligible = [
    requirement({ id: "a", amountCents: 60_000, schedulePercentage: null }),
    requirement({ id: "b", amountCents: 40_000, scheduleSortOrder: 1, schedulePercentage: null }),
  ];
  const result = allocateByOriginalPaymentPercentages({ totalCents: 5000, eligible });
  assert.equal(result.basisUsed, "CURRENT_REMAINING_AMOUNTS");
  assert.equal(result.adjustments.reduce((s, v) => s + v, 0), 5000);
});

test("buildImpactForPreset split excludes prior CO row from current-balance fallback", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "ORIGINAL_PAYMENT_PERCENTAGES",
    requirements: [
      requirement({
        id: "sched",
        amountCents: 70_000,
        sourcePaymentScheduleItemId: "sched-1",
        schedulePercentage: 70,
      }),
      requirement({
        id: "co",
        amountCents: 30_000,
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-prior",
        schedulePercentage: null,
        scheduleSortOrder: 1,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.allocations?.length, 1);
  assert.equal(built.impact.allocations?.[0]?.paymentRequirementId, "sched");
  assert.equal(built.impact.allocations?.[0]?.adjustmentCents, 5000);
});

test("allocateByOriginalPaymentPercentages uses schedule percentages", () => {
  const eligible = [
    requirement({
      id: "a",
      amountCents: 60_000,
      sourcePaymentScheduleItemId: "sched-a",
      schedulePercentage: 60,
    }),
    requirement({
      id: "b",
      amountCents: 40_000,
      sourcePaymentScheduleItemId: "sched-b",
      scheduleSortOrder: 1,
      schedulePercentage: 40,
    }),
  ];
  const result = allocateByOriginalPaymentPercentages({ totalCents: 5000, eligible });
  assert.equal(result.basisUsed, "ORIGINAL_PAYMENT_PERCENTAGES");
  assert.deepEqual(result.adjustments, [3000, 2000]);
});

test("allocateByOriginalPaymentPercentages puts rounding remainder on last schedule-backed row", () => {
  const eligible = [
    requirement({
      id: "a",
      amountCents: 33_000,
      sourcePaymentScheduleItemId: "sched-a",
      schedulePercentage: 33,
    }),
    requirement({
      id: "b",
      amountCents: 33_000,
      sourcePaymentScheduleItemId: "sched-b",
      scheduleSortOrder: 1,
      schedulePercentage: 33,
    }),
    requirement({
      id: "c",
      amountCents: 34_000,
      sourcePaymentScheduleItemId: "sched-c",
      scheduleSortOrder: 2,
      schedulePercentage: 34,
    }),
  ];
  const result = allocateByOriginalPaymentPercentages({ totalCents: 100, eligible });
  assert.equal(result.basisUsed, "ORIGINAL_PAYMENT_PERCENTAGES");
  assert.deepEqual(result.adjustments, [33, 33, 34]);
});

test("allocateEqualSplit splits evenly with remainder on last", () => {
  const eligible = [
    requirement({ id: "a" }),
    requirement({ id: "b", scheduleSortOrder: 1 }),
    requirement({ id: "c", scheduleSortOrder: 2 }),
  ];
  const result = allocateEqualSplit({ totalCents: 10_000, eligible });
  assert.equal(result.adjustments.reduce((s, v) => s + v, 0), 10_000);
});

test("buildPaymentPlanReviewModel marks settled rows ineligible", () => {
  const model = buildPaymentPlanReviewModel({
    priceDeltaCents: 5000,
    requirements: [
      requirement({ id: "paid", status: JobPaymentRequirementStatus.PAID }),
      requirement({ id: "open", scheduleSortOrder: 1 }),
    ],
  });
  assert.equal(model.contractPlanCount, 1);
  assert.equal(model.excludedOpenPaymentCount, 0);
  assert.equal(model.rows[0]?.isAutoAllocationEligible, false);
  assert.equal(model.rows[1]?.isAutoAllocationEligible, true);
});

test("buildPaymentPlanReviewModel marks prior CO row excluded from auto split", () => {
  const model = buildPaymentPlanReviewModel({
    priceDeltaCents: 5000,
    requirements: [
      requirement({ id: "deposit", title: "Deposit", scheduleSortOrder: 0 }),
      requirement({
        id: "co-deposit",
        title: "CO-001 Deposit",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-1",
        scheduleSortOrder: 2,
      }),
      requirement({
        id: "manual",
        title: "Ad-hoc payment",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: null,
        scheduleSortOrder: 3,
      }),
    ],
  });
  assert.equal(model.contractPlanCount, 1);
  assert.equal(model.excludedOpenPaymentCount, 2);

  const coRow = model.rows.find((row) => row.paymentRequirementId === "co-deposit");
  assert.equal(coRow?.isContractPlanRow, false);
  assert.equal(coRow?.isAutoAllocationEligible, false);
  assert.equal(coRow?.isCustomAllocationEligible, false);
  assert.equal(coRow?.exclusionReason, "Prior Change Order payment");

  const manualRow = model.rows.find((row) => row.paymentRequirementId === "manual");
  assert.equal(manualRow?.exclusionReason, "Manual payment — not part of original contract plan");
});

test("buildImpactForPreset equal split excludes prior CO and manual rows", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 10_000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      requirement({ id: "a", title: "Deposit", scheduleSortOrder: 0 }),
      requirement({
        id: "b",
        title: "Final",
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
      requirement({
        id: "co",
        title: "CO-001 Deposit",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-1",
        scheduleSortOrder: 2,
      }),
      requirement({
        id: "manual",
        title: "Ad-hoc",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: null,
        scheduleSortOrder: 3,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.allocations?.length, 2);
  assert.deepEqual(
    built.impact.allocations?.map((row) => row.paymentRequirementId).sort(),
    ["a", "b"],
  );
  assert.equal(
    built.impact.allocations?.reduce((sum, row) => sum + row.adjustmentCents, 0),
    10_000,
  );
});

test("rounding remainder goes to last contract row not prior CO row", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 100,
    allocationBasis: "ORIGINAL_PAYMENT_PERCENTAGES",
    requirements: [
      requirement({
        id: "a",
        sourcePaymentScheduleItemId: "sched-a",
        schedulePercentage: 33,
        scheduleSortOrder: 0,
      }),
      requirement({
        id: "b",
        sourcePaymentScheduleItemId: "sched-b",
        schedulePercentage: 33,
        scheduleSortOrder: 1,
      }),
      requirement({
        id: "c",
        sourcePaymentScheduleItemId: "sched-c",
        schedulePercentage: 34,
        scheduleSortOrder: 2,
      }),
      requirement({
        id: "co",
        title: "CO-001 Deposit",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-1",
        scheduleSortOrder: 3,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.allocations?.length, 3);
  assert.equal(built.impact.allocations?.find((row) => row.paymentRequirementId === "co"), undefined);
  assert.deepEqual(
    built.impact.allocations?.map((row) => row.adjustmentCents),
    [33, 33, 34],
  );
});

test("buildImpactForPreset current-balance split uses contract rows only", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "CURRENT_REMAINING_AMOUNTS",
    requirements: [
      requirement({ id: "a", amountCents: 60_000, scheduleSortOrder: 0 }),
      requirement({
        id: "co",
        amountCents: 40_000,
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-1",
        scheduleSortOrder: 1,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.allocations?.length, 1);
  assert.equal(built.impact.allocations?.[0]?.paymentRequirementId, "a");
  assert.equal(built.impact.allocations?.[0]?.adjustmentCents, 5000);
});

test("buildImpactForPreset deposit now rest to final", () => {
  const built = buildImpactForPreset({
    preset: "DEPOSIT_NOW_REST_TO_FINAL",
    priceDeltaCents: 10_000,
    depositCents: 3000,
    requirements: [
      requirement({ id: "dep", title: "Deposit", scheduleSortOrder: 0 }),
      requirement({
        id: "final",
        title: "Final",
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
    changeOrderNumber: 2,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.strategy, "DEPOSIT_NOW_REST_TO_FINAL");
  assert.equal(built.impact.initialPayment?.amountCents, 3000);
  assert.equal(built.impact.allocations?.[0]?.adjustmentCents, 7000);
  assert.equal(built.impact.customerTermsText.includes(built.impact.resolvedPreview.customerSummary), true);
});

test("buildImpactForPreset rejects deposit exceeding total", () => {
  const built = buildImpactForPreset({
    preset: "DEPOSIT_NOW_REST_TO_FINAL",
    priceDeltaCents: 5000,
    depositCents: 6000,
    requirements: [requirement({ id: "final", anchorType: PaymentScheduleAnchorType.FINAL_BALANCE })],
  });
  assert.equal(built.ok, false);
});

test("buildImpactForPreset collapses full deposit to due before added work", () => {
  const built = buildImpactForPreset({
    preset: "DEPOSIT_NOW_REST_TO_FINAL",
    priceDeltaCents: 5000,
    depositCents: 5000,
    requirements: [requirement({ id: "final", anchorType: PaymentScheduleAnchorType.FINAL_BALANCE })],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.strategy, "DUE_BEFORE_ADDED_WORK");
});

test("buildImpactForPreset split across remaining payments", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 10_000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      requirement({ id: "a", title: "Progress", scheduleSortOrder: 0 }),
      requirement({
        id: "b",
        title: "Final",
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.schemaVersion, CHANGE_ORDER_PAYMENT_IMPACT_SCHEMA_VERSION_V2);
  assert.equal(built.impact.allocations?.length, 2);
  assert.equal(
    built.impact.allocations?.reduce((s, row) => s + row.adjustmentCents, 0),
    10_000,
  );
  assert.ok(built.impact.resolvedPreview.allocationLines?.length);
});

test("buildImpactForPreset with no eligible payments uses due before added work", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    requirements: [
      requirement({ id: "paid", status: JobPaymentRequirementStatus.PAID }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.strategy, "DUE_BEFORE_ADDED_WORK");
});

test("v2 parser accepts split strategy", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      requirement({ id: "a" }),
      requirement({ id: "b", scheduleSortOrder: 1 }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const parsed = parseChangeOrderPaymentImpact(built.impact);
  assert.equal(parsed.ok, true);
});

test("validatePaymentImpactAllocationSum rejects mismatch", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [requirement({ id: "a" }), requirement({ id: "b", scheduleSortOrder: 1 })],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const broken = {
    ...built.impact,
    allocations: built.impact.allocations?.map((row, index) =>
      index === 0 ? { ...row, adjustmentCents: row.adjustmentCents + 100 } : row,
    ),
  };
  const errors = validatePaymentImpactAllocationSum({
    priceDeltaCents: 5000,
    impact: broken,
  });
  assert.ok(errors.length > 0);
});

test("materialization validation rejects allocation amount drift", () => {
  const built = buildImpactForPreset({
    preset: "ADD_TO_FINAL_PAYMENT",
    priceDeltaCents: 5000,
    requirements: [
      requirement({
        id: "final",
        title: "Final",
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = validatePaymentImpactForMaterialization({
    priceDeltaCents: 5000,
    paymentImpactJson: built.impact,
    requirements: [
      requirement({
        id: "final",
        title: "Final",
        amountCents: 105_000,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /no longer matches the customer-approved payment allocation/i);
  }
});

test("materialization validation excludes paid rows from split", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      requirement({ id: "a", title: "Progress" }),
      requirement({ id: "b", title: "Final", scheduleSortOrder: 1 }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const paidId = built.impact.allocations?.[0]?.paymentRequirementId;
  const result = validatePaymentImpactForMaterialization({
    priceDeltaCents: 5000,
    paymentImpactJson: built.impact,
    requirements: [
      requirement({
        id: paidId ?? "a",
        title: "Progress",
        status: JobPaymentRequirementStatus.PAID,
      }),
      requirement({ id: "b", title: "Final", scheduleSortOrder: 1 }),
    ],
  });
  assert.equal(result.ok, false);
});

test("buildManualImpactFromPresetImpact applies edited rows and regenerates terms", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      requirement({ id: "a", title: "Progress", amountCents: 40_000 }),
      requirement({
        id: "b",
        title: "Final",
        amountCents: 60_000,
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const reviewModel = buildPaymentPlanReviewModel({
    priceDeltaCents: 5000,
    requirements: [
      requirement({ id: "a", title: "Progress", amountCents: 40_000 }),
      requirement({
        id: "b",
        title: "Final",
        amountCents: 60_000,
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
    adjustments: new Map(
      (built.impact.allocations ?? []).map((row) => [row.paymentRequirementId, row.adjustmentCents]),
    ),
  });

  const manual = buildManualImpactFromPresetImpact({
    baseImpact: built.impact,
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    reviewModel,
    manualNewAmountsById: new Map([
      ["a", 43_500],
      ["b", 61_500],
    ]),
  });
  assert.equal(manual.ok, true);
  if (!manual.ok) return;
  assert.equal(manual.impact.allocationBasis, "MANUAL");
  assert.equal(manual.impact.originPreset, "SPLIT_ACROSS_REMAINING_PAYMENTS");
  assert.equal(manual.impact.originAllocationBasis, "EQUAL_SPLIT");
  assert.match(manual.impact.customerTermsText, /Progress/);
  assert.match(manual.impact.customerTermsText, /Final/);
});

test("formatCustomAllocationOriginLabel uses contractor-readable labels", () => {
  assert.equal(
    formatCustomAllocationOriginLabel({
      originPreset: "ADD_TO_FINAL_PAYMENT",
      originAllocationBasis: null,
    }),
    "Add to final payment",
  );
  assert.equal(
    formatCustomAllocationOriginLabel({
      originPreset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
      originAllocationBasis: "EQUAL_SPLIT",
    }),
    "Equal split",
  );
  assert.equal(
    formatCustomAllocationOriginLabel({
      originPreset: "DEPOSIT_NOW_REST_TO_FINAL",
      originAllocationBasis: null,
    }),
    "Deposit now, rest to final payment",
  );
});

test("getCustomAllocationStaffNote describes manual origin without enum names", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      requirement({ id: "a", title: "Progress", amountCents: 40_000 }),
      requirement({
        id: "b",
        title: "Final",
        amountCents: 60_000,
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const manual = buildManualImpactFromPresetImpact({
    baseImpact: built.impact,
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    reviewModel: buildPaymentPlanReviewModel({
      priceDeltaCents: 5000,
      requirements: [
        requirement({ id: "a", title: "Progress", amountCents: 40_000 }),
        requirement({
          id: "b",
          title: "Final",
          amountCents: 60_000,
          scheduleSortOrder: 1,
          anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
        }),
      ],
      adjustments: new Map(
        (built.impact.allocations ?? []).map((row) => [row.paymentRequirementId, row.adjustmentCents]),
      ),
    }),
    manualNewAmountsById: new Map([
      ["a", 43_500],
      ["b", 61_500],
    ]),
  });
  assert.equal(manual.ok, true);
  if (!manual.ok) return;
  assert.equal(isManualPaymentAllocation(manual.impact), true);
  assert.match(getCustomAllocationStaffNote(manual.impact), /Started from Equal split\./);
  assert.match(getCustomAllocationStaffNote(manual.impact), /adjusted manually\./);
  assert.doesNotMatch(getCustomAllocationStaffNote(manual.impact), /EQUAL_SPLIT/);
});

test("generateCustomerTermsFromImpact manual lines remain generated", () => {
  const terms = generateCustomerTermsFromImpact({
    strategy: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationLines: [
      {
        title: "Progress",
        currentAmountCents: 40_000,
        adjustmentCents: 3500,
        newAmountCents: 43_500,
      },
      {
        title: "Final",
        currentAmountCents: 60_000,
        adjustmentCents: 1500,
        newAmountCents: 61_500,
      },
    ],
  });
  assert.match(terms.customerTermsText, /Progress/);
  assert.match(terms.customerTermsText, /Final/);
});

function requirementsWithPriorCoRow(): JobPaymentRequirementForResolver[] {
  return [
    requirement({
      id: "co-due",
      title: "CO-001 Deposit",
      amountCents: 3000,
      sourcePaymentScheduleItemId: null,
      sourceChangeOrderId: "co-prior",
      scheduleSortOrder: 0,
      status: JobPaymentRequirementStatus.DUE,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    }),
    requirement({
      id: "deposit",
      title: "Deposit",
      amountCents: 50_000,
      sourcePaymentScheduleItemId: "sched-deposit",
      scheduleSortOrder: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
    requirement({
      id: "final",
      title: "Final Balance",
      amountCents: 50_000,
      sourcePaymentScheduleItemId: "sched-final",
      scheduleSortOrder: 1,
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    }),
  ];
}

test("resolveNextUnpaidPaymentRequirement ignores prior CO payment row", () => {
  const next = resolveNextUnpaidPaymentRequirement(requirementsWithPriorCoRow());
  assert.equal(next?.id, "deposit");
});

test("resolveFinalUnpaidPaymentRequirement ignores prior CO payment row", () => {
  const final = resolveFinalUnpaidPaymentRequirement(requirementsWithPriorCoRow());
  assert.equal(final?.id, "final");
});

test("buildImpactForPreset add to next targets contract payment when CO row sorts first", () => {
  const built = buildImpactForPreset({
    preset: "ADD_TO_NEXT_UNPAID_PAYMENT",
    priceDeltaCents: 5000,
    requirements: requirementsWithPriorCoRow(),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.strategy, "ADD_TO_NEXT_UNPAID_PAYMENT");
  assert.equal(built.impact.targetPaymentRequirementId, "deposit");
  assert.match(built.impact.customerTermsText, /Deposit/);
  assert.doesNotMatch(built.impact.customerTermsText, /CO-001/);
});

test("buildImpactForPreset add to final targets contract final when CO row exists", () => {
  const built = buildImpactForPreset({
    preset: "ADD_TO_FINAL_PAYMENT",
    priceDeltaCents: 8000,
    requirements: requirementsWithPriorCoRow(),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.targetPaymentRequirementId, "final");
});

test("buildImpactForPreset deposit rest to final uses contract final only", () => {
  const built = buildImpactForPreset({
    preset: "DEPOSIT_NOW_REST_TO_FINAL",
    priceDeltaCents: 10_000,
    depositCents: 3000,
    changeOrderNumber: 2,
    requirements: requirementsWithPriorCoRow(),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.allocations?.[0]?.paymentRequirementId, "final");
  assert.match(built.impact.customerTermsText, /Final Balance/);
});

test("buildImpactForPreset add to next falls back when only prior CO rows are open", () => {
  const built = buildImpactForPreset({
    preset: "ADD_TO_NEXT_UNPAID_PAYMENT",
    priceDeltaCents: 5000,
    requirements: [
      requirement({
        id: "co-only",
        title: "CO-002 Deposit",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-2",
        status: JobPaymentRequirementStatus.DUE,
      }),
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.strategy, "DUE_BEFORE_ADDED_WORK");
});

test("derivePaymentImpactWarnings flags missing contract payment when only CO rows are open", () => {
  const warnings = derivePaymentImpactWarnings({
    priceDeltaCents: 5000,
    strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
    requirements: [
      requirement({
        id: "co-only",
        sourcePaymentScheduleItemId: null,
        sourceChangeOrderId: "co-2",
        status: JobPaymentRequirementStatus.DUE,
      }),
    ],
  });
  assert.ok(warnings.some((w) => w.code === "NO_UNSETTLED_PAYMENTS"));
  assert.ok(warnings.some((w) => w.message.includes("No contract payment")));
});

test("v1 buildPaymentImpactForStrategy still targets contract row when CO row exists", () => {
  const built = buildPaymentImpactForStrategy({
    strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
    priceDeltaCents: 5000,
    requirements: requirementsWithPriorCoRow(),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.schemaVersion, 1);
  assert.equal(built.impact.targetPaymentRequirementId, "deposit");
});
