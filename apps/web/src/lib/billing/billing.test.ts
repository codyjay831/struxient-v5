import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeBillableUnits,
  recordAiUsageAgainstPeriod,
} from "./billing-periods";
import {
  isAiAllowedSubscriptionStatus,
  isProductAccessSubscriptionStatus,
  normalizeStripeSubscriptionStatus,
} from "./billing-subscription-status";
import {
  getIncludedAiUnits,
  getTrialDays,
  TOKENS_PER_BILLABLE_UNIT,
} from "./billing-config";

describe("billing-config", () => {
  it("returns sensible defaults", () => {
    assert.equal(getTrialDays(), 14);
    assert.equal(getIncludedAiUnits(), 500);
    assert.equal(TOKENS_PER_BILLABLE_UNIT, 1000);
  });
});

describe("billing-subscription-status", () => {
  it("normalizes stripe statuses", () => {
    assert.equal(normalizeStripeSubscriptionStatus("trialing"), "TRIALING");
    assert.equal(normalizeStripeSubscriptionStatus("active"), "ACTIVE");
    assert.equal(normalizeStripeSubscriptionStatus("past_due"), "PAST_DUE");
  });

  it("defines product and AI access rules", () => {
    assert.equal(isProductAccessSubscriptionStatus("TRIALING"), true);
    assert.equal(isProductAccessSubscriptionStatus("PAST_DUE"), true);
    assert.equal(isProductAccessSubscriptionStatus("CANCELED"), false);
    assert.equal(isAiAllowedSubscriptionStatus("TRIALING"), true);
    assert.equal(isAiAllowedSubscriptionStatus("PAST_DUE"), false);
  });
});

describe("computeBillableUnits", () => {
  it("charges minimum one unit", () => {
    assert.equal(computeBillableUnits(0, 0), 1);
  });

  it("rounds up by token bucket size", () => {
    assert.equal(computeBillableUnits(500, 500), 1);
    assert.equal(computeBillableUnits(1000, 1000), 2);
    assert.equal(computeBillableUnits(1500, 0), 2);
  });
});

describe("recordAiUsageAgainstPeriod logic", () => {
  it("exports record function", () => {
    assert.equal(typeof recordAiUsageAgainstPeriod, "function");
  });
});
