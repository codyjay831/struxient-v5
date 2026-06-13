import assert from "node:assert/strict";
import test from "node:test";
import {
  GATE7_PAYMENT_IMPACT_STRATEGY,
  validateScopeRevisionPaymentImpact,
} from "./quote-scope-revision-payment-policy";

test("Gate 7 payment strategy is zero-dollar-only", () => {
  assert.equal(GATE7_PAYMENT_IMPACT_STRATEGY, "ZERO_DOLLAR_ONLY");
});

test("zero-dollar scope revision is allowed", () => {
  const result = validateScopeRevisionPaymentImpact({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
  });
  assert.equal(result.ok, true);
});

test("non-zero scope revision requires approved payment-impact operation", () => {
  const blocked = validateScopeRevisionPaymentImpact({
    priceDeltaCents: 5000,
    hasApprovedPaymentImpactOperationInTx: false,
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error);

  const allowed = validateScopeRevisionPaymentImpact({
    priceDeltaCents: 5000,
    hasApprovedPaymentImpactOperationInTx: true,
  });
  assert.equal(allowed.ok, true);
});

