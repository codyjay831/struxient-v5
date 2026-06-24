import assert from "node:assert/strict";
import test from "node:test";
import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import {
  allocateByOriginalPaymentPercentages,
  allocateEqualSplit,
  buildImpactForPreset,
  buildPaymentPlanReviewModel,
  distributeCentsByWeights,
} from "@/lib/change-order/payment-impact-allocation";
import type { JobPaymentRequirementForResolver } from "@/lib/change-order/payment-impact-resolver";
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
    sourcePaymentScheduleItemId: null,
    scheduleSortOrder: 0,
    anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
    schedulePercentage: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("distributeCentsByWeights puts remainder on last row", () => {
  const result = distributeCentsByWeights(10_000, [33, 33, 34]);
  assert.equal(result.reduce((s, v) => s + v, 0), 10_000);
  assert.equal(result[2], 10_000 - result[0] - result[1]);
});

test("allocateByOriginalPaymentPercentages falls back when no percentages", () => {
  const eligible = [
    requirement({ id: "a", amountCents: 60_000, schedulePercentage: null }),
    requirement({ id: "b", amountCents: 40_000, scheduleSortOrder: 1 }),
  ];
  const result = allocateByOriginalPaymentPercentages({ totalCents: 5000, eligible });
  assert.equal(result.basisUsed, "CURRENT_REMAINING_AMOUNTS");
  assert.equal(result.adjustments.reduce((s, v) => s + v, 0), 5000);
});

test("allocateByOriginalPaymentPercentages uses schedule percentages", () => {
  const eligible = [
    requirement({ id: "a", amountCents: 60_000, schedulePercentage: 60 }),
    requirement({ id: "b", amountCents: 40_000, scheduleSortOrder: 1, schedulePercentage: 40 }),
  ];
  const result = allocateByOriginalPaymentPercentages({ totalCents: 5000, eligible });
  assert.equal(result.basisUsed, "ORIGINAL_PAYMENT_PERCENTAGES");
  assert.deepEqual(result.adjustments, [3000, 2000]);
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
  assert.equal(model.eligibleCount, 1);
  assert.equal(model.rows[0]?.eligible, false);
  assert.equal(model.rows[1]?.eligible, true);
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
