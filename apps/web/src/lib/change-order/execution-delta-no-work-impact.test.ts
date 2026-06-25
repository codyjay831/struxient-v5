import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderLineOperation } from "@prisma/client";
import {
  buildNoWorkImpactExecutionDelta,
  parseNoWorkImpactConfirmed,
} from "@/lib/change-order/execution-delta-no-work-impact";

test("buildNoWorkImpactExecutionDelta stores auditable meta and no task ops", () => {
  const delta = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 3,
    changeOrderId: "co-1",
    number: 2,
    priceDeltaCents: 5000,
    reasoning: "Paperwork fee",
    lines: [
      {
        id: "line-1",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "Paperwork fee",
        quantity: "1",
        unitPriceCents: 5000,
        priceDeltaCents: 5000,
        executionRelevant: true,
      },
    ],
  });
  assert.equal(parseNoWorkImpactConfirmed(delta.meta), true);
  assert.equal(
    delta.operations.some(
      (operation) =>
        operation.type === "ADD_TASK" ||
        operation.type === "CANCEL_TASK" ||
        operation.type === "MODIFY_TASK",
    ),
    false,
  );
  assert.equal(
    delta.operations.some((operation) => operation.type === "UPDATE_PAYMENT_REQUIREMENT"),
    false,
  );
});
