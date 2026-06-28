import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderStatus,
  JobScopeItemStatus,
  JobTaskStatus,
  ZeroDollarPolicyClass,
} from "@prisma/client";
import { buildDueBeforeAddedWorkPaymentImpactJson } from "@/lib/change-order/change-order-test-fixture";
import {
  CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE,
  deriveChangeOrderCustomerAcceptReadiness,
} from "@/lib/change-order/change-order-customer-accept-readiness";
import { buildNoWorkImpactExecutionDelta } from "@/lib/change-order/execution-delta-no-work-impact";

test("SENT CO with saved payment and confirmed no-work-impact is customer-accept ready", () => {
  const executionDeltaJson = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 66000,
    reasoning: "Add-on",
    lines: [],
  });
  const readiness = deriveChangeOrderCustomerAcceptReadiness({
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 66000,
    paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(66000),
    executionDeltaJson,
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    scopeItems: [
      {
        id: "scope-1",
        executionRelevant: true,
        status: JobScopeItemStatus.ACTIVE,
      },
    ],
    tasks: [
      {
        id: "task-1",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
  });
  assert.equal(readiness.canAccept, true);
});

test("customer accept readiness rejects stale plan with customer-safe copy", () => {
  const executionDeltaJson = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 66000,
    reasoning: "Add-on",
    lines: [],
  });
  const readiness = deriveChangeOrderCustomerAcceptReadiness({
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 66000,
    paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(66000),
    executionDeltaJson,
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 2,
    scopeItems: [],
    tasks: [],
  });
  assert.equal(readiness.canAccept, false);
  assert.equal(readiness.blockers[0]?.customerMessage, CHANGE_ORDER_CUSTOMER_ACCEPT_UNAVAILABLE_MESSAGE);
  assert.match(readiness.blockers[0]?.staffMessage ?? "", /Job plan changed/i);
});

test("send-time readiness can skip SENT status requirement", () => {
  const executionDeltaJson = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 66000,
    reasoning: "Add-on",
    lines: [],
  });
  const readiness = deriveChangeOrderCustomerAcceptReadiness({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 66000,
    paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(66000),
    executionDeltaJson,
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    scopeItems: [
      {
        id: "scope-1",
        executionRelevant: true,
        status: JobScopeItemStatus.ACTIVE,
      },
    ],
    tasks: [
      {
        id: "task-1",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
    requireSentStatus: false,
  });
  assert.equal(readiness.canAccept, true);
});

test("zero-dollar customer accept is allowed only for CUSTOMER_FACING_CHANGE", () => {
  const executionDeltaJson = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 0,
    reasoning: "Same price scope acknowledgement",
    lines: [],
  });
  const baseInput = {
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 0,
    paymentImpactJson: null,
    executionDeltaJson,
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    scopeItems: [],
    tasks: [],
  };

  const customerFacing = deriveChangeOrderCustomerAcceptReadiness({
    ...baseInput,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE,
  });
  assert.equal(customerFacing.canAccept, true);

  const internalExecution = deriveChangeOrderCustomerAcceptReadiness({
    ...baseInput,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY,
  });
  assert.equal(internalExecution.canAccept, false);
  assert.equal(internalExecution.blockers[0]?.code, "ZERO_DOLLAR_POLICY");

  const missing = deriveChangeOrderCustomerAcceptReadiness(baseInput);
  assert.equal(missing.canAccept, false);
  assert.equal(missing.blockers[0]?.code, "ZERO_DOLLAR_POLICY");
});

test("hard-signal orphan detection blocks customer accept when required signals are missing", () => {
  const executionDeltaJson = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 66000,
    reasoning: "Add-on",
    lines: [],
  });
  const readiness = deriveChangeOrderCustomerAcceptReadiness({
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 66000,
    paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(66000),
    executionDeltaJson,
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    scopeItems: [
      {
        id: "scope-1",
        executionRelevant: true,
        status: JobScopeItemStatus.ACTIVE,
      },
    ],
    tasks: [
      {
        id: "dependent-task",
        status: JobTaskStatus.TODO,
        hardSignal: true,
        requiresSignals: ["permit"],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
  });
  assert.equal(readiness.canAccept, false);
  assert.equal(readiness.blockers[0]?.code, "EXECUTION_NOT_READY");
  assert.match(readiness.blockers[0]?.staffMessage ?? "", /hard-signal/i);
});
