import assert from "node:assert/strict";
import test from "node:test";
import { QuoteExecutionPlanStatus } from "@prisma/client";
import { validateQuotePlanProposalForApply } from "@/lib/quote-plan/quote-plan-validation";

function makeProposal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    quoteId: "q1",
    schemaVersion: 1,
    plannerVersion: "fixture-v1",
    generatedAgainstInputHash: "hash-a",
    basePlanVersion: 3,
    operations: [
      {
        opId: "op-1",
        type: "ADD_TASK",
        task: {
          title: "Schedule inspection",
          category: "INSPECTION",
          stageId: "stage-1",
          lineItemIds: ["line-1"],
        },
      },
    ],
    ...overrides,
  };
}

test("validateQuotePlanProposalForApply rejects stale input hash", () => {
  const result = validateQuotePlanProposalForApply(makeProposal(), {
    quoteId: "q1",
    allowedLineItemIds: new Set(["line-1"]),
    executionRelevantLineItemIds: new Set(["line-1"]),
    plan: {
      status: QuoteExecutionPlanStatus.DRAFT,
      planVersion: 3,
      planningInputHash: "hash-a",
    },
    currentPlanningInputHash: "hash-b",
    existingTasks: [],
  });
  assert.equal(result.ok, false);
});

test("validateQuotePlanProposalForApply accepts valid add-task proposal", () => {
  const result = validateQuotePlanProposalForApply(makeProposal(), {
    quoteId: "q1",
    allowedLineItemIds: new Set(["line-1"]),
    executionRelevantLineItemIds: new Set(["line-1"]),
    plan: {
      status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
      planVersion: 3,
      planningInputHash: "hash-a",
    },
    currentPlanningInputHash: "hash-a",
    existingTasks: [
      {
        id: "t-existing",
        protectedAt: null,
        humanEditedAt: null,
        lineItemIds: ["line-1"],
        requiresSignals: [],
        providesSignals: ["permit_ready"],
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("validateQuotePlanProposalForApply rejects cancellation that removes needed signal provider", () => {
  const result = validateQuotePlanProposalForApply(
    makeProposal({
      operations: [
        { opId: "cancel-provider", type: "CANCEL_TASK", taskId: "provider", reason: "remove" },
      ],
    }),
    {
      quoteId: "q1",
      allowedLineItemIds: new Set(["line-1"]),
      executionRelevantLineItemIds: new Set(["line-1"]),
      plan: {
        status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
        planVersion: 3,
        planningInputHash: "hash-a",
      },
      currentPlanningInputHash: "hash-a",
      existingTasks: [
        {
          id: "provider",
          protectedAt: null,
          humanEditedAt: null,
          lineItemIds: ["line-1"],
          requiresSignals: [],
          providesSignals: ["permit_ready"],
        },
        {
          id: "consumer",
          protectedAt: null,
          humanEditedAt: null,
          lineItemIds: ["line-1"],
          requiresSignals: ["permit_ready"],
          providesSignals: [],
        },
      ],
    },
  );
  assert.equal(result.ok, false);
});

test("validateQuotePlanProposalForApply rejects update on protected task", () => {
  const result = validateQuotePlanProposalForApply(
    makeProposal({
      operations: [
        {
          opId: "update-protected",
          type: "UPDATE_TASK",
          taskId: "protected-task",
          task: { title: "New title" },
        },
      ],
    }),
    {
      quoteId: "q1",
      allowedLineItemIds: new Set(["line-1"]),
      executionRelevantLineItemIds: new Set(["line-1"]),
      plan: {
        status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
        planVersion: 3,
        planningInputHash: "hash-a",
      },
      currentPlanningInputHash: "hash-a",
      existingTasks: [
        {
          id: "protected-task",
          protectedAt: new Date(),
          humanEditedAt: null,
          lineItemIds: ["line-1"],
          requiresSignals: [],
          providesSignals: [],
        },
      ],
    },
  );
  assert.equal(result.ok, false);
});

test("validateQuotePlanProposalForApply allows relink when coverage remains", () => {
  const result = validateQuotePlanProposalForApply(
    makeProposal({
      operations: [
        {
          opId: "relink-task",
          type: "RELINK_TASK_SCOPE",
          taskId: "task-1",
          lineItemIds: ["line-1", "line-2"],
        },
      ],
    }),
    {
      quoteId: "q1",
      allowedLineItemIds: new Set(["line-1", "line-2"]),
      executionRelevantLineItemIds: new Set(["line-1", "line-2"]),
      plan: {
        status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
        planVersion: 3,
        planningInputHash: "hash-a",
      },
      currentPlanningInputHash: "hash-a",
      existingTasks: [
        {
          id: "task-1",
          protectedAt: null,
          humanEditedAt: null,
          lineItemIds: ["line-1"],
          requiresSignals: [],
          providesSignals: [],
        },
      ],
    },
  );
  assert.equal(result.ok, true);
});

test("validateQuotePlanProposalForApply rejects cancel that breaks coverage", () => {
  const result = validateQuotePlanProposalForApply(
    makeProposal({
      operations: [
        { opId: "cancel-only-task", type: "CANCEL_TASK", taskId: "task-1", reason: "cleanup" },
      ],
    }),
    {
      quoteId: "q1",
      allowedLineItemIds: new Set(["line-1"]),
      executionRelevantLineItemIds: new Set(["line-1"]),
      plan: {
        status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
        planVersion: 3,
        planningInputHash: "hash-a",
      },
      currentPlanningInputHash: "hash-a",
      existingTasks: [
        {
          id: "task-1",
          protectedAt: null,
          humanEditedAt: null,
          lineItemIds: ["line-1"],
          requiresSignals: [],
          providesSignals: [],
        },
      ],
    },
  );
  assert.equal(result.ok, false);
});

