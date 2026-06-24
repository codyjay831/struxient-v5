import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChangeOrderPaymentImpact,
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
