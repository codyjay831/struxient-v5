import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChangeOrderPaymentImpact,
  validatePaymentImpactAllocationSum,
  type ChangeOrderPaymentImpact,
} from "@/lib/change-order/payment-impact-schema";

function validImpact(
  overrides: Partial<ChangeOrderPaymentImpact> = {},
): ChangeOrderPaymentImpact {
  return {
    schemaVersion: 1,
    strategy: "DUE_BEFORE_ADDED_WORK",
    customerTermsText: "An additional $500.00 is due before we start the added work.",
    resolvedPreview: {
      strategyLabel: "Due before added work starts",
      customerSummary: "An additional $500.00 is due before we start the added work.",
      dueTimingLabel: "Before added work starts",
      blocksAddedWork: true,
    },
    ...overrides,
  };
}

test("parseChangeOrderPaymentImpact accepts valid MVP strategies", () => {
  for (const strategy of [
    "DUE_BEFORE_ADDED_WORK",
    "ADD_TO_NEXT_UNPAID_PAYMENT",
    "ADD_TO_FINAL_PAYMENT",
    "CREDIT_REMAINING_BALANCE",
  ] as const) {
    const parsed = parseChangeOrderPaymentImpact(
      validImpact({
        strategy,
        targetPaymentRequirementId:
          strategy === "ADD_TO_NEXT_UNPAID_PAYMENT" || strategy === "ADD_TO_FINAL_PAYMENT"
            ? "pay-req-1"
            : undefined,
        resolvedPreview: {
          ...validImpact().resolvedPreview,
          strategyLabel: strategy,
          targetPaymentRequirementId:
            strategy === "ADD_TO_NEXT_UNPAID_PAYMENT" || strategy === "ADD_TO_FINAL_PAYMENT"
              ? "pay-req-1"
              : null,
        },
      }),
    );
    assert.equal(parsed.ok, true, strategy);
  }
});

test("parseChangeOrderPaymentImpact rejects invalid strategy", () => {
  const parsed = parseChangeOrderPaymentImpact({
    ...validImpact(),
    strategy: "INVALID_STRATEGY",
  });
  assert.equal(parsed.ok, false);
});

test("parseChangeOrderPaymentImpact accepts v2 split strategy", () => {
  const parsed = parseChangeOrderPaymentImpact({
    schemaVersion: 2,
    strategy: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    customerTermsText: "Spread across payments.",
    allocationBasis: "EQUAL_SPLIT",
    allocations: [
      {
        paymentRequirementId: "pay-1",
        title: "Progress",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 2500,
        newAmountCents: 52_500,
      },
      {
        paymentRequirementId: "pay-2",
        title: "Final",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 2500,
        newAmountCents: 52_500,
      },
    ],
    resolvedPreview: {
      strategyLabel: "Spread across remaining payments",
      customerSummary: "The additional $50.00 will be spread across your remaining unpaid payments.",
      adjustmentTotalCents: 5000,
      allocationLines: [
        {
          title: "Progress",
          currentAmountCents: 50_000,
          adjustmentCents: 2500,
          newAmountCents: 52_500,
        },
      ],
    },
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.impact.schemaVersion, 2);
  }
});

test("parseChangeOrderPaymentImpact requires target for schedule strategies", () => {
  const parsed = parseChangeOrderPaymentImpact(
    validImpact({
      strategy: "ADD_TO_FINAL_PAYMENT",
      targetPaymentRequirementId: undefined,
    }),
  );
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => /target payment requirement/i.test(error)));
  }
});

test("parseChangeOrderPaymentImpact accepts MANUAL allocation basis with origin fields", () => {
  const parsed = parseChangeOrderPaymentImpact({
    schemaVersion: 2,
    strategy: "ADD_TO_FINAL_PAYMENT",
    customerTermsText: "Manual custom allocation.",
    allocationBasis: "MANUAL",
    originPreset: "ADD_TO_FINAL_PAYMENT",
    originAllocationBasis: "ORIGINAL_PAYMENT_PERCENTAGES",
    allocations: [
      {
        paymentRequirementId: "pay-1",
        title: "Progress",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 2000,
        newAmountCents: 52_000,
      },
      {
        paymentRequirementId: "pay-2",
        title: "Final",
        statusAtApproval: "PENDING",
        currentAmountCents: 40_000,
        adjustmentCents: 3000,
        newAmountCents: 43_000,
      },
    ],
    resolvedPreview: {
      strategyLabel: "Add to final payment",
      customerSummary: "The additional amount will be manually allocated.",
      adjustmentTotalCents: 5000,
      allocationLines: [
        {
          title: "Progress",
          currentAmountCents: 50_000,
          adjustmentCents: 2000,
          newAmountCents: 52_000,
        },
      ],
    },
  });
  assert.equal(parsed.ok, true);
});

test("parseChangeOrderPaymentImpact rejects duplicate allocation targets", () => {
  const parsed = parseChangeOrderPaymentImpact({
    schemaVersion: 2,
    strategy: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    customerTermsText: "Duplicate rows",
    allocationBasis: "MANUAL",
    allocations: [
      {
        paymentRequirementId: "pay-1",
        title: "Progress",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 1000,
        newAmountCents: 51_000,
      },
      {
        paymentRequirementId: "pay-1",
        title: "Progress duplicate",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 2000,
        newAmountCents: 52_000,
      },
    ],
    resolvedPreview: {
      strategyLabel: "Spread across remaining payments",
      customerSummary: "Invalid duplicate targets.",
    },
  });
  assert.equal(parsed.ok, false);
});

test("parseChangeOrderPaymentImpact rejects settled adjusted rows", () => {
  const parsed = parseChangeOrderPaymentImpact({
    schemaVersion: 2,
    strategy: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    customerTermsText: "Settled row adjusted.",
    allocationBasis: "MANUAL",
    allocations: [
      {
        paymentRequirementId: "pay-1",
        title: "Paid payment",
        statusAtApproval: "PAID",
        currentAmountCents: 10_000,
        adjustmentCents: 1000,
        newAmountCents: 11_000,
      },
    ],
    resolvedPreview: {
      strategyLabel: "Spread across remaining payments",
      customerSummary: "Invalid settled adjustment.",
    },
  });
  assert.equal(parsed.ok, false);
});

test("validatePaymentImpactAllocationSum rejects manual allocation mismatch", () => {
  const parsed = parseChangeOrderPaymentImpact({
    schemaVersion: 2,
    strategy: "ADD_TO_FINAL_PAYMENT",
    customerTermsText: "Manual mismatch",
    allocationBasis: "MANUAL",
    originPreset: "ADD_TO_FINAL_PAYMENT",
    allocations: [
      {
        paymentRequirementId: "pay-1",
        title: "Progress",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 1200,
        newAmountCents: 51_200,
      },
      {
        paymentRequirementId: "pay-2",
        title: "Final",
        statusAtApproval: "PENDING",
        currentAmountCents: 50_000,
        adjustmentCents: 1200,
        newAmountCents: 51_200,
      },
    ],
    resolvedPreview: {
      strategyLabel: "Add to final payment",
      customerSummary: "Mismatch totals.",
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const errors = validatePaymentImpactAllocationSum({
    priceDeltaCents: 5000,
    impact: parsed.impact,
  });
  assert.ok(errors.some((error) => /must equal the Change Order amount/i.test(error)));
});
