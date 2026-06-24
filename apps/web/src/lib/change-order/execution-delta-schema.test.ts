import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChangeOrderExecutionDelta,
  type ChangeOrderExecutionDeltaProposal,
} from "./execution-delta-schema";

const validProposal: ChangeOrderExecutionDeltaProposal = {
  schemaVersion: 1,
  baseJobPlanVersion: 3,
  operations: [
    {
      opId: "scope:add",
      type: "ADD_SCOPE_ITEM",
      targetEntityType: "JobScopeItem",
      payload: {
        description: "Added panel",
        quantity: "1",
        executionRelevant: true,
      },
      reason: "Customer requested extra panel.",
    },
  ],
};

test("schema parsing accepts MVP execution delta operations", () => {
  const parsed = parseChangeOrderExecutionDelta(validProposal);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.proposal.operations[0]?.type, "ADD_SCOPE_ITEM");
  }
});

test("schema parsing rejects duplicate opId values", () => {
  const parsed = parseChangeOrderExecutionDelta({
    ...validProposal,
    operations: [
      validProposal.operations[0],
      {
        ...validProposal.operations[0],
        type: "ADD_TASK",
        targetEntityType: "JobTask",
      },
    ],
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.ok(parsed.errors.some((error) => error.includes("Duplicate operation id")));
  }
});

test("schema parsing rejects unsupported operation types", () => {
  const parsed = parseChangeOrderExecutionDelta({
    ...validProposal,
    operations: [
      {
        ...validProposal.operations[0],
        type: "REPLACE_TASK",
      },
    ],
  });
  assert.equal(parsed.ok, false);
});
