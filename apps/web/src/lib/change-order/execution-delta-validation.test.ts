import assert from "node:assert/strict";
import test from "node:test";
import { JobScopeItemStatus, JobTaskStatus } from "@prisma/client";
import { validateChangeOrderExecutionDelta } from "./execution-delta-validation";
import type { ChangeOrderExecutionDeltaProposal } from "./execution-delta-schema";
import { buildPaymentImpactForStrategy } from "./payment-impact-resolver";
import { changeOrderPaymentImpactToJson } from "./payment-impact-schema";

function dueBeforeAddedWorkImpact(priceDeltaCents: number) {
  const built = buildPaymentImpactForStrategy({
    strategy: "DUE_BEFORE_ADDED_WORK",
    priceDeltaCents,
    requirements: [],
  });
  if (!built.ok) {
    throw new Error(built.errors.join(" "));
  }
  return changeOrderPaymentImpactToJson(built.impact);
}

const baseScope = {
  id: "scope-1",
  executionRelevant: true,
  status: JobScopeItemStatus.ACTIVE,
};

const baseTask = {
  id: "task-1",
  status: JobTaskStatus.TODO,
  hardSignal: false,
  requiresSignals: [],
  providesSignals: [],
  jobScopeItemIds: ["scope-1"],
};

const addScopeWithTask: ChangeOrderExecutionDeltaProposal = {
  schemaVersion: 1,
  baseJobPlanVersion: 4,
  operations: [
    {
      opId: "scope:add",
      type: "ADD_SCOPE_ITEM",
      targetEntityType: "JobScopeItem",
      payload: {
        description: "Battery backup",
        quantity: "1",
        executionRelevant: true,
      },
      reason: "Customer requested backup power.",
    },
    {
      opId: "task:add",
      type: "ADD_TASK",
      targetEntityType: "JobTask",
      payload: {
        title: "Install battery backup",
        scopeOpIds: ["scope:add"],
      },
      reason: "Cover new execution-relevant scope.",
    },
  ],
};

test("validation accepts add scope when delta also adds task coverage", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: addScopeWithTask,
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 0,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, true);
});

test("validation fails add execution-relevant scope without task coverage", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: {
      ...addScopeWithTask,
      operations: [addScopeWithTask.operations[0]],
    },
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 0,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.classification, "INVARIANT_FAILED");
    assert.ok(result.errors.some((error) => error.includes("not covered")));
  }
});

test("stale base version triggers execution review classification", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: addScopeWithTask,
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 5,
    priceDeltaCents: 0,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.classification, "STALE_PLAN");
  }
});

test("payment delta requires approved paymentImpactJson", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: addScopeWithTask,
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 50000,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.classification, "INVARIANT_FAILED");
    assert.ok(result.errors.some((error) => error.includes("Choose and save")));
  }
});

test("payment delta passes with approved paymentImpactJson", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: addScopeWithTask,
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 50000,
    paymentImpactJson: dueBeforeAddedWorkImpact(50000),
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, true);
});

test("payment delta rejects legacy payment op coexistence with paymentImpactJson", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: {
      ...addScopeWithTask,
      operations: [
        ...addScopeWithTask.operations,
        {
          opId: "payment:add",
          type: "UPDATE_PAYMENT_REQUIREMENT",
          targetEntityType: "JobPaymentRequirement",
          payload: { amountCents: 50000, title: "Change Order CO-001" },
          reason: "Legacy duplicate path.",
        },
      ],
    },
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 50000,
    paymentImpactJson: dueBeforeAddedWorkImpact(50000),
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.classification, "INVARIANT_FAILED");
    assert.ok(result.errors.some((error) => error.includes("must not coexist")));
  }
});

test("payment delta rejects legacy-only payment operations", () => {
  const paymentOp = {
    opId: "payment:add",
    type: "UPDATE_PAYMENT_REQUIREMENT" as const,
    targetEntityType: "JobPaymentRequirement" as const,
    payload: { amountCents: 50000, title: "Change Order CO-001" },
    reason: "Reconcile customer-approved price delta.",
  };
  const result = validateChangeOrderExecutionDelta({
    rawDelta: {
      ...addScopeWithTask,
      operations: [...addScopeWithTask.operations, paymentOp, { ...paymentOp, opId: "payment:dup" }],
    },
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 50000,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("Legacy execution payment ops")));
  }
});

test("cancel DONE task is rejected during validation", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: {
      schemaVersion: 1,
      baseJobPlanVersion: 4,
      operations: [
        {
          opId: "cancel:done",
          type: "CANCEL_TASK",
          targetEntityType: "JobTask",
          targetEntityId: "task-done",
          reason: "Should not cancel completed work.",
        },
      ],
    },
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 0,
    scopeItems: [baseScope],
    tasks: [
      {
        ...baseTask,
        id: "task-done",
        status: JobTaskStatus.DONE,
      },
    ],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.includes("completed tasks cannot be canceled")));
  }
});

test("cancel already CANCELED task is allowed as no-op in validation", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: {
      schemaVersion: 1,
      baseJobPlanVersion: 4,
      operations: [
        {
          opId: "cancel:already",
          type: "CANCEL_TASK",
          targetEntityType: "JobTask",
          targetEntityId: "task-canceled",
          reason: "Already canceled.",
        },
      ],
    },
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 0,
    scopeItems: [{ id: "scope-1", executionRelevant: false, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "task-canceled",
        status: JobTaskStatus.CANCELED,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: [],
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("MODIFY_TASK scope relink is simulated in validation", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: {
      schemaVersion: 1,
      baseJobPlanVersion: 4,
      operations: [
        {
          opId: "modify:task",
          type: "MODIFY_TASK",
          targetEntityType: "JobTask",
          targetEntityId: "task-1",
          payload: { jobScopeItemIds: ["scope-2"] },
          reason: "Relink task coverage.",
        },
      ],
    },
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 0,
    scopeItems: [
      { id: "scope-1", executionRelevant: false, status: JobScopeItemStatus.ACTIVE },
      { id: "scope-2", executionRelevant: true, status: JobScopeItemStatus.ACTIVE },
    ],
    tasks: [baseTask],
  });
  assert.equal(result.ok, true);
});

test("price-impact draft allows missing paymentImpactJson when allowMissingPaymentImpactForDraft", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: addScopeWithTask,
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 25000,
    paymentImpactJson: null,
    allowMissingPaymentImpactForDraft: true,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, true);
});

test("price-impact apply still requires paymentImpactJson without draft flag", () => {
  const result = validateChangeOrderExecutionDelta({
    rawDelta: addScopeWithTask,
    baseJobPlanVersion: 4,
    currentJobPlanVersion: 4,
    priceDeltaCents: 25000,
    paymentImpactJson: null,
    scopeItems: [baseScope],
    tasks: [baseTask],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join(" "), /Choose and save|approved payment terms/i);
  }
});
