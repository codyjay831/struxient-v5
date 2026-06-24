import assert from "node:assert/strict";
import test from "node:test";
import { classifyLegacyAcceptedChangeOrderForReview } from "./change-order-legacy-backfill";

test("legacy accepted execution-relevant ADD without task op becomes review", () => {
  const result = classifyLegacyAcceptedChangeOrderForReview({
    status: "ACCEPTED",
    applicationStatus: "NOT_APPLIED",
    executionDeltaJson: {
      schemaVersion: 1,
      baseJobPlanVersion: 1,
      operations: [
        {
          opId: "scope:line-1",
          type: "ADD_SCOPE_ITEM",
          targetEntityType: "JobScopeItem",
          payload: { executionRelevant: true, description: "Panel add" },
          reason: "Legacy backfill",
        },
      ],
      meta: {
        source: "migration-backfill",
        legacyScopeReconciliation: true,
      },
    },
  });
  assert.equal(result.shouldFlagForReview, true);
  assert.ok(result.reason?.includes("task coverage"));
});

test("applied legacy CO remains unflagged by classifier", () => {
  const result = classifyLegacyAcceptedChangeOrderForReview({
    status: "APPLIED",
    applicationStatus: "APPLIED",
    executionDeltaJson: {
      schemaVersion: 1,
      baseJobPlanVersion: 1,
      operations: [],
      meta: { legacyScopeReconciliation: true },
    },
  });
  assert.equal(result.shouldFlagForReview, false);
});

test("legacy accepted non-execution-relevant scope remains unflagged", () => {
  const result = classifyLegacyAcceptedChangeOrderForReview({
    status: "ACCEPTED",
    applicationStatus: "NOT_APPLIED",
    executionDeltaJson: {
      schemaVersion: 1,
      baseJobPlanVersion: 1,
      operations: [
        {
          opId: "scope:line-1",
          type: "ADD_SCOPE_ITEM",
          targetEntityType: "JobScopeItem",
          payload: { executionRelevant: false, description: "Paperwork only" },
          reason: "Legacy backfill",
        },
      ],
      meta: { legacyScopeReconciliation: true },
    },
  });
  assert.equal(result.shouldFlagForReview, false);
});
