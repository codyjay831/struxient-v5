import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { validateQuoteExecutionReviewProposalForApply } from "./quote-execution-review-proposal";
import { QuoteExecutionReviewProposalSchema } from "./quote-execution-review-proposal-schema";

function buildProposal() {
  return QuoteExecutionReviewProposalSchema.parse({
    quoteId: "quote-1",
    summary: "Whole quote review",
    assumptions: [],
    warnings: [],
    missingContext: [],
    operations: [
      {
        opId: "op-add",
        type: "add_task",
        lineItemId: "line-1",
        reason: "Missing permit approval provider.",
        task: {
          title: "Confirm permit approval",
          category: TaskTemplateCategory.PERMIT,
          stageId: "stage-permit",
          instructions: null,
          providesSignals: ["permit.approved"],
          requiresSignals: ["permit.submitted"],
          hardSignal: true,
          checklist: [{ label: "Verify approval letter" }],
          resources: [],
        },
      },
      {
        opId: "op-patch",
        type: "patch_task_signals",
        taskId: "task-1",
        reason: "Install task should require permit approval.",
        addProvides: [],
        removeProvides: [],
        addRequires: ["permit.approved"],
        removeRequires: [],
      },
    ],
    consolidationHints: [],
    manualDecisions: [],
  });
}

test("validateQuoteExecutionReviewProposalForApply accepts valid selected operations", () => {
  const proposal = buildProposal();
  const result = validateQuoteExecutionReviewProposalForApply({
    proposal,
    allowedStages: [{ id: "stage-permit", name: "Engineering & Permits" }],
    validLineItemIds: new Set(["line-1"]),
    validTaskIds: new Set(["task-1"]),
    selectedOperationIds: ["op-add", "op-patch"],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.selectedOperationIds, ["op-add", "op-patch"]);
  }
});

test("validateQuoteExecutionReviewProposalForApply rejects add_task with unknown stage", () => {
  const proposal = buildProposal();
  const result = validateQuoteExecutionReviewProposalForApply({
    proposal,
    allowedStages: [{ id: "stage-install", name: "Installation" }],
    validLineItemIds: new Set(["line-1"]),
    validTaskIds: new Set(["task-1"]),
    selectedOperationIds: ["op-add"],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /no longer valid/i);
    assert.deepEqual(result.invalidOperationIds, ["op-add"]);
  }
});

test("validateQuoteExecutionReviewProposalForApply rejects unknown selected operation id", () => {
  const proposal = buildProposal();
  const result = validateQuoteExecutionReviewProposalForApply({
    proposal,
    allowedStages: [{ id: "stage-permit", name: "Engineering & Permits" }],
    validLineItemIds: new Set(["line-1"]),
    validTaskIds: new Set(["task-1"]),
    selectedOperationIds: ["op-missing"],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /no longer available/i);
    assert.deepEqual(result.invalidOperationIds, ["op-missing"]);
  }
});

test("validateQuoteExecutionReviewProposalForApply blocks simulated proposal apply", () => {
  const proposal = buildProposal();
  const result = validateQuoteExecutionReviewProposalForApply({
    proposal,
    allowedStages: [{ id: "stage-permit", name: "Engineering & Permits" }],
    validLineItemIds: new Set(["line-1"]),
    validTaskIds: new Set(["task-1"]),
    selectedOperationIds: ["op-add"],
    generation: {
      isSimulated: true,
      canApply: false,
      applyBlockedReason: "Simulated output cannot be applied.",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /simulated output/i);
  }
});
