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

function taskRow(overrides: Partial<{
  id: string;
  protectedAt: Date | null;
  humanEditedAt: Date | null;
  lineItemIds: string[];
  requiresSignals: string[];
  providesSignals: string[];
  hardSignal: boolean;
}> = {}) {
  return {
    id: "task-1",
    protectedAt: null,
    humanEditedAt: null,
    lineItemIds: ["line-1"],
    requiresSignals: [],
    providesSignals: [],
    hardSignal: false,
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
      taskRow({ id: "t-existing", providesSignals: ["permit_ready"] }),
    ],
  });
  assert.equal(result.ok, true);
});

test("validateQuotePlanProposalForApply rejects cancellation that removes needed hard-signal provider", () => {
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
        taskRow({ id: "provider", providesSignals: ["permit_ready"] }),
        taskRow({ id: "consumer", requiresSignals: ["permit_ready"], hardSignal: true }),
      ],
    },
  );
  assert.equal(result.ok, false);
});

test("validateQuotePlanProposalForApply allows cancellation when only soft dependency is orphaned", () => {
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
        taskRow({ id: "provider", providesSignals: ["permit.ready"] }),
        taskRow({ id: "consumer", requiresSignals: ["permit approved"], hardSignal: false }),
      ],
    },
  );
  assert.equal(result.ok, true);
});

test("validateQuotePlanProposalForApply treats equivalent signal spellings as the same provider", () => {
  const result = validateQuotePlanProposalForApply(
    makeProposal({
      operations: [
        {
          opId: "add-consumer",
          type: "ADD_TASK",
          task: {
            title: "Schedule work",
            category: "SCHEDULING",
            stageId: "stage-1",
            lineItemIds: ["line-1"],
            requiresSignals: ["permit.approved"],
            hardSignal: true,
          },
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
      existingTasks: [taskRow({ id: "provider", providesSignals: ["permit-approved"] })],
    },
  );
  assert.equal(result.ok, true);
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
      existingTasks: [taskRow({ id: "protected-task", protectedAt: new Date() })],
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
      existingTasks: [taskRow({ id: "task-1" })],
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
      existingTasks: [taskRow({ id: "task-1" })],
    },
  );
  assert.equal(result.ok, false);
});

