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
    strategy: "SPLIT_ACROSS_PAYMENTS",
  });
  assert.equal(parsed.ok, false);
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
