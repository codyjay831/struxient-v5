import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderLineOperation } from "@prisma/client";
import {
  buildDefaultExecutionDeltaFromChangeOrderLines,
} from "@/lib/change-order/execution-delta-build";
import {
  confirmGeneratedTaskInProposal,
  createManualAddTaskOperation,
  OFFICE_REVIEW_CONFIRMED_AT_PAYLOAD_KEY,
  OFFICE_REVIEW_CONFIRMED_PAYLOAD_KEY,
  updateTaskOperationInProposal,
} from "@/lib/change-order/change-order-execution-task-composer";
import {
  COMMERCIAL_SAVE_EXECUTION_REVIEW_REQUIRED_ERROR,
  executionLineStructuresEqual,
  remapExecutionDeltaChangeOrderLineIds,
  resolveExecutionDeltaForChangeOrderPersist,
  storedExecutionDeltaHasCustomWork,
  toExecutionLineSnapshot,
} from "@/lib/change-order/change-order-execution-delta-persist";

function buildSampleDelta() {
  return buildDefaultExecutionDeltaFromChangeOrderLines({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 66000,
    reasoning: "Add vent",
    lines: [
      {
        id: "line-old",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "High flow vent",
        quantity: "1",
        unitPriceCents: 66000,
        priceDeltaCents: 66000,
        executionRelevant: true,
      },
    ],
    skipLegacyPaymentOperation: true,
  });
}

test("commercial save preserves confirmed generated task when execution line structure unchanged", () => {
  const stored = buildSampleDelta();
  const taskOp = stored.operations.find((op) => op.type === "ADD_TASK");
  assert.ok(taskOp);
  const confirmed = confirmGeneratedTaskInProposal(stored, taskOp!.opId);
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;

  const previousLines = [
    toExecutionLineSnapshot({
      id: "line-old",
      operation: ChangeOrderLineOperation.ADD,
      sourceJobScopeItemId: null,
      description: "High flow vent",
      quantity: "1",
      executionRelevant: true,
    }),
  ];
  const nextLines = [
    toExecutionLineSnapshot({
      id: "line-new",
      operation: ChangeOrderLineOperation.ADD,
      sourceJobScopeItemId: null,
      description: "High flow vent",
      quantity: "1",
      executionRelevant: true,
    }),
  ];

  const resolved = resolveExecutionDeltaForChangeOrderPersist({
    executionDeltaOverride: undefined,
    storedExecutionDeltaJson: confirmed.proposal,
    previousLines,
    nextLines,
    buildDefault: () => buildSampleDelta(),
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;

  const nextTask = resolved.proposal.operations.find((op) => op.type === "ADD_TASK");
  assert.equal(nextTask?.payload?.[OFFICE_REVIEW_CONFIRMED_PAYLOAD_KEY], true);
  assert.equal(typeof nextTask?.payload?.[OFFICE_REVIEW_CONFIRMED_AT_PAYLOAD_KEY], "string");
  assert.equal(nextTask?.linkedChangeOrderLineId, "line-new");
  assert.equal(nextTask?.opId, "task:line-new");
});

test("commercial save preserves manual ADD_TASK when execution line structure unchanged", () => {
  const stored = buildSampleDelta();
  const manual = createManualAddTaskOperation({
    title: "Manual inspection",
    reason: "Office added inspection",
  });
  const withManual = {
    ...stored,
    operations: [...stored.operations, manual],
  };

  const previousLines = [
    toExecutionLineSnapshot({
      id: "line-old",
      operation: ChangeOrderLineOperation.ADD,
      sourceJobScopeItemId: null,
      description: "High flow vent",
      quantity: "1",
      executionRelevant: true,
    }),
  ];
  const nextLines = [
    toExecutionLineSnapshot({
      id: "line-new",
      operation: ChangeOrderLineOperation.ADD,
      sourceJobScopeItemId: null,
      description: "High flow vent",
      quantity: "1",
      executionRelevant: true,
    }),
  ];

  const resolved = resolveExecutionDeltaForChangeOrderPersist({
    executionDeltaOverride: undefined,
    storedExecutionDeltaJson: withManual,
    previousLines,
    nextLines,
    buildDefault: () => buildSampleDelta(),
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.ok(resolved.proposal.operations.some((op) => op.opId === manual.opId));
});

test("commercial save blocks when execution structure changes and custom work exists", () => {
  const stored = buildSampleDelta();
  const taskOp = stored.operations.find((op) => op.type === "ADD_TASK");
  assert.ok(taskOp);
  const confirmed = confirmGeneratedTaskInProposal(stored, taskOp!.opId);
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;

  const resolved = resolveExecutionDeltaForChangeOrderPersist({
    executionDeltaOverride: undefined,
    storedExecutionDeltaJson: confirmed.proposal,
    previousLines: [
      toExecutionLineSnapshot({
        id: "line-old",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "High flow vent",
        quantity: "1",
        executionRelevant: true,
      }),
    ],
    nextLines: [
      toExecutionLineSnapshot({
        id: "line-new",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "High flow vent XL",
        quantity: "1",
        executionRelevant: true,
      }),
    ],
    buildDefault: () => buildSampleDelta(),
  });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.match(resolved.error, new RegExp(COMMERCIAL_SAVE_EXECUTION_REVIEW_REQUIRED_ERROR));
});

test("price-only commercial line fingerprint ignores line id", () => {
  const previous = [
    toExecutionLineSnapshot({
      id: "line-old",
      operation: ChangeOrderLineOperation.ADD,
      sourceJobScopeItemId: null,
      description: "High flow vent",
      quantity: "1",
      executionRelevant: true,
    }),
  ];
  const next = [
    toExecutionLineSnapshot({
      id: "line-new",
      operation: ChangeOrderLineOperation.ADD,
      sourceJobScopeItemId: null,
      description: "High flow vent",
      quantity: "1",
      executionRelevant: true,
    }),
  ];
  assert.equal(executionLineStructuresEqual(previous, next), true);
  assert.equal(storedExecutionDeltaHasCustomWork(buildSampleDelta()), false);
});

test("remapExecutionDeltaChangeOrderLineIds rewrites linked scope and task ops", () => {
  const delta = buildSampleDelta();
  const remapped = remapExecutionDeltaChangeOrderLineIds(
    delta,
    new Map([["line-old", "line-new"]]),
  );
  assert.ok(remapped.operations.some((op) => op.opId === "scope:line-new"));
  assert.ok(remapped.operations.some((op) => op.opId === "task:line-new"));
});
