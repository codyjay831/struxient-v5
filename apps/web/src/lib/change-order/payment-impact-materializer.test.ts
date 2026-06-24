import assert from "node:assert/strict";
import test from "node:test";
import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import {
  validatePaymentImpactForMaterialization,
} from "@/lib/change-order/payment-impact-materializer";
import { buildPaymentImpactForStrategy } from "@/lib/change-order/payment-impact-resolver";
import type { JobPaymentRequirementForResolver } from "@/lib/change-order/payment-impact-resolver";

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
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

test("materialization validation rejects credit on positive delta", () => {
  const impact = buildPaymentImpactForStrategy({
    strategy: "CREDIT_REMAINING_BALANCE",
    priceDeltaCents: -5000,
    requirements: [requirement({ id: "pay-1" })],
  });
  assert.equal(impact.ok, true);
  if (!impact.ok) return;

  const result = validatePaymentImpactForMaterialization({
    priceDeltaCents: 5000,
    paymentImpactJson: impact.impact,
    requirements: [requirement({ id: "pay-1" })],
  });
  assert.equal(result.ok, false);
});

test("materialization validation rejects missing target for next payment strategy", () => {
  const result = validatePaymentImpactForMaterialization({
    priceDeltaCents: 5000,
    paymentImpactJson: {
      schemaVersion: 1,
      strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
      customerTermsText: "Added to next payment.",
      resolvedPreview: {
        strategyLabel: "Add to next unpaid payment",
        customerSummary: "Added to next payment.",
      },
    },
    requirements: [requirement({ id: "pay-1" })],
  });
  assert.equal(result.ok, false);
});

test("materialization validation rejects settled target", () => {
  const built = buildPaymentImpactForStrategy({
    strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
    priceDeltaCents: 5000,
    requirements: [
      requirement({ id: "pay-1", status: JobPaymentRequirementStatus.PAID }),
    ],
  });
  assert.equal(built.ok, false);
});

test("materialization validation rejects credit exceeding unsettled balance", () => {
  const built = buildPaymentImpactForStrategy({
    strategy: "CREDIT_REMAINING_BALANCE",
    priceDeltaCents: -150_000,
    requirements: [requirement({ id: "pay-1", amountCents: 100_000 })],
  });
  assert.equal(built.ok, false);
});

test("materialization validation accepts due before added work for positive delta", () => {
  const built = buildPaymentImpactForStrategy({
    strategy: "DUE_BEFORE_ADDED_WORK",
    priceDeltaCents: 5000,
    requirements: [],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = validatePaymentImpactForMaterialization({
    priceDeltaCents: 5000,
    paymentImpactJson: built.impact,
    requirements: [],
  });
  assert.equal(result.ok, true);
});

test("zero-dollar materialization validation accepts null payment impact", () => {
  const result = validatePaymentImpactForMaterialization({
    priceDeltaCents: 0,
    paymentImpactJson: null,
    requirements: [],
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.impact, null);
  }
});
