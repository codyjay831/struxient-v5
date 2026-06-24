import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPaymentImpactReadyForAccept,
  assertPaymentImpactReadyForSend,
  validateChangeOrderPaymentImpactGate,
} from "@/lib/change-order/payment-impact-gates";
import type { ChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";

function dueBeforeImpact(): ChangeOrderPaymentImpact {
  return {
    schemaVersion: 1,
    strategy: "DUE_BEFORE_ADDED_WORK",
    customerTermsText: "Due before added work starts.",
    resolvedPreview: {
      strategyLabel: "Due before added work starts",
      customerSummary: "An additional $250.00 is due before we start the added work.",
      dueTimingLabel: "Before added work starts",
      blocksAddedWork: true,
    },
  };
}

test("zero-dollar CO does not require payment impact", () => {
  const gate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: 0,
    paymentImpactJson: null,
  });
  assert.equal(gate.ok, true);
  assert.equal(gate.ok && gate.impact, null);
});

test("zero-dollar CO rejects stored payment impact", () => {
  const gate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: 0,
    paymentImpactJson: dueBeforeImpact(),
  });
  assert.equal(gate.ok, false);
});

test("price-impact CO cannot send without paymentImpactJson", () => {
  const gate = assertPaymentImpactReadyForSend({
    priceDeltaCents: 5000,
    paymentImpactJson: null,
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.match(gate.error, /Choose and save how the customer will pay/i);
  }
});

test("credit strategy requires negative delta", () => {
  const creditImpact: ChangeOrderPaymentImpact = {
    schemaVersion: 1,
    strategy: "CREDIT_REMAINING_BALANCE",
    customerTermsText: "Credit applied to remaining balance.",
    resolvedPreview: {
      strategyLabel: "Credit remaining balance",
      customerSummary: "A credit of $100.00 will reduce your remaining balance.",
      dueTimingLabel: "Credit applied to remaining balance",
    },
  };
  const blocked = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: 5000,
    paymentImpactJson: creditImpact,
  });
  assert.equal(blocked.ok, false);

  const allowed = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: -5000,
    paymentImpactJson: creditImpact,
  });
  assert.equal(allowed.ok, true);
});

test("positive delta cannot use CREDIT_REMAINING_BALANCE", () => {
  const gate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: 1000,
    paymentImpactJson: {
      schemaVersion: 1,
      strategy: "CREDIT_REMAINING_BALANCE",
      customerTermsText: "Credit",
      resolvedPreview: {
        strategyLabel: "Credit remaining balance",
        customerSummary: "Credit",
      },
    },
  });
  assert.equal(gate.ok, false);
});

test("missing target blocks schedule strategies", () => {
  const gate = validateChangeOrderPaymentImpactGate({
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
  });
  assert.equal(gate.ok, false);
});

test("accept gate mirrors send gate", () => {
  const impact = dueBeforeImpact();
  const send = assertPaymentImpactReadyForSend({
    priceDeltaCents: 25000,
    paymentImpactJson: impact,
  });
  const accept = assertPaymentImpactReadyForAccept({
    priceDeltaCents: 25000,
    paymentImpactJson: impact,
  });
  assert.equal(send.ok, true);
  assert.equal(accept.ok, true);
});
