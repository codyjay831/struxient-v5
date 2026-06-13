import assert from "node:assert/strict";
import test from "node:test";
import { JobScopeItemStatus, JobTaskStatus } from "@prisma/client";
import { validateScopeRevisionApplyGuards } from "./quote-scope-revision-apply-guards";

test("scope revision apply guards pass for covered zero-dollar revision", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "s1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "t1",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["s1"],
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("scope revision apply guards block non-zero delta without approved payment operation", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 100,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "s1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "t1",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["s1"],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("payment-impact operation")));
});

test("scope revision apply guards block uncovered active execution scope", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "s1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "t1",
        status: JobTaskStatus.CANCELED,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["s1"],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("not covered")));
});

test("scope revision apply guards block future tasks left on removed scope only", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [
      { id: "removed", executionRelevant: true, status: JobScopeItemStatus.REMOVED },
      { id: "active", executionRelevant: true, status: JobScopeItemStatus.ACTIVE },
    ],
    tasks: [
      {
        id: "bad",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["removed"],
      },
      {
        id: "good",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["active"],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("Future tasks must be canceled or relinked")));
});

test("scope revision apply guards block hard-signal orphan dependencies", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "active", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "provider",
        status: JobTaskStatus.CANCELED,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: ["permit-approved"],
        jobScopeItemIds: ["active"],
      },
      {
        id: "consumer",
        status: JobTaskStatus.TODO,
        hardSignal: true,
        requiresSignals: ["permit-approved"],
        providesSignals: [],
        jobScopeItemIds: ["active"],
      },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("hard-signal dependencies")));
});

