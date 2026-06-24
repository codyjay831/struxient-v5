import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  deriveChangeOrderLifecycleReadiness,
  executionImpactHasGeneratedTaskSuggestions,
  parseApplyErrorSummary,
  projectChangeOrderExecutionImpact,
} from "./change-order-execution-projection";
import { buildDefaultExecutionDeltaFromChangeOrderLines } from "./execution-delta-build";

test("generated ADD_TASK is flagged for office review", () => {
  const delta = buildDefaultExecutionDeltaFromChangeOrderLines({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 0,
    reasoning: "Add panel",
    lines: [
      {
        id: "line-1",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "Extra panel",
        quantity: "1",
        unitPriceCents: null,
        priceDeltaCents: 0,
        executionRelevant: true,
      },
    ],
  });

  const impact = projectChangeOrderExecutionImpact({
    executionDeltaJson: delta,
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    priceDeltaCents: 0,
    scopeItems: [],
    tasks: [],
  });

  assert.equal(impact.addedTasks.length, 1);
  assert.equal(impact.addedTasks[0]?.isGenerated, true);
  assert.equal(impact.addedTasks[0]?.sourceKind, "generated");
  assert.match(impact.addedTasks[0]?.sourceLabel ?? "", /review before sending/i);
  assert.equal(executionImpactHasGeneratedTaskSuggestions(impact), true);
});

test("lifecycle readiness surfaces APPLY_FAILED and NEEDS_EXECUTION_REVIEW", () => {
  assert.equal(
    deriveChangeOrderLifecycleReadiness({
      status: ChangeOrderStatus.ACCEPTED,
      applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
      draftCommercialValid: true,
      executionValidationOk: false,
      hasGeneratedTaskSuggestions: false,
      stalePlan: false,
    }),
    "APPLY_FAILED",
  );

  assert.equal(
    deriveChangeOrderLifecycleReadiness({
      status: ChangeOrderStatus.ACCEPTED,
      applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
      draftCommercialValid: true,
      executionValidationOk: false,
      hasGeneratedTaskSuggestions: false,
      stalePlan: true,
    }),
    "ACCEPTED_NEEDS_EXECUTION_REVIEW",
  );
});

test("parseApplyErrorSummary returns safe customer-facing messages only from stored json", () => {
  const summary = parseApplyErrorSummary({
    classification: "INVARIANT_FAILED",
    errors: ["Task coverage missing for scope item."],
  });
  assert.equal(summary.classification, "INVARIANT_FAILED");
  assert.deepEqual(summary.messages, ["Task coverage missing for scope item."]);
});

test("invalid cancel operation surfaces per-operation validation message", () => {
  const impact = projectChangeOrderExecutionImpact({
    executionDeltaJson: {
      schemaVersion: 1,
      baseJobPlanVersion: 1,
      operations: [
        {
          opId: "manual-cancel:task-done",
          type: "CANCEL_TASK",
          targetEntityType: "JobTask",
          targetEntityId: "task-done",
          reason: "Remove work",
          payload: { composerSource: "change-order-task-composer" },
        },
      ],
    },
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    priceDeltaCents: 0,
    scopeItems: [],
    tasks: [
      {
        id: "task-done",
        title: "Completed task",
        status: JobTaskStatus.DONE,
        scopeItemIds: [],
      },
    ],
  });

  assert.equal(impact.validationOk, false);
  assert.ok(
    impact.canceledTasks[0]?.validationErrors.some((error) =>
      /completed task/i.test(error),
    ),
  );
});

test("execution projection includes existing task status for cancel ops", () => {
  const impact = projectChangeOrderExecutionImpact({
    executionDeltaJson: {
      schemaVersion: 1,
      baseJobPlanVersion: 1,
      operations: [
        {
          opId: "cancel-1",
          type: "CANCEL_TASK",
          targetEntityType: "JobTask",
          targetEntityId: "task-1",
          reason: "Scope removed",
        },
      ],
    },
    baseJobPlanVersion: 1,
    currentJobPlanVersion: 1,
    priceDeltaCents: 0,
    scopeItems: [],
    tasks: [
      {
        id: "task-1",
        title: "Install panel",
        status: JobTaskStatus.TODO,
        scopeItemIds: ["scope-1"],
      },
    ],
  });

  assert.equal(impact.canceledTasks[0]?.existingTaskStatus, JobTaskStatus.TODO);
  assert.equal(impact.canceledTasks[0]?.taskTitle, "Install panel");
});
