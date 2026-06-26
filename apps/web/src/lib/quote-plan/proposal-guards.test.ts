import assert from "node:assert/strict";
import test from "node:test";
import { buildUncoordinatedDraftProposal } from "@/lib/quote-plan/uncoordinated-draft";
import {
  QUOTE_PLAN_EMPTY_FALLBACK_ERROR,
  QUOTE_PLAN_INVALID_AI_ERROR,
  hasQuotePlanProposalOperations,
  quotePlanProposalEmptyError,
  shouldOpenQuotePlanProposalReview,
  shouldShowQuotePlanProposalApplyAction,
  toQuoteWidePlanGenerationError,
} from "@/lib/quote-plan/proposal-guards";

function draftTask(title: string) {
  return {
    id: `task-${title}`,
    title,
    category: "GENERAL" as const,
    stageId: "stage-1",
    instructions: null,
    providesSignals: [],
    requiresSignals: [],
    hardSignal: false,
    requirementsJson: {},
    partsRequiredJson: {},
    sourceTaskTemplateId: null,
  };
}

test("AI fallback with no per-line draft tasks is treated as a failed generation", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "quote-1",
    generatedAgainstInputHash: "hash-1",
    basePlanVersion: 1,
    lines: [{ id: "line-1", description: "Roof Replacement", tasks: [] }],
  });

  assert.equal(proposal.operations.length, 0);
  assert.equal(hasQuotePlanProposalOperations(proposal), false);
  assert.deepEqual(quotePlanProposalEmptyError(), {
    ok: false,
    error: QUOTE_PLAN_EMPTY_FALLBACK_ERROR,
  });
});

test("AI fallback with existing per-line draft tasks remains reviewable", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "quote-1",
    generatedAgainstInputHash: "hash-1",
    basePlanVersion: 1,
    lines: [
      {
        id: "line-1",
        description: "Roof Replacement",
        tasks: [draftTask("Remove old roofing")],
      },
    ],
  });

  assert.equal(proposal.operations.length, 1);
  assert.equal(hasQuotePlanProposalOperations(proposal), true);
});

test("QuotePlanControlPanel guard refuses to open zero-operation proposal review", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "quote-1",
    generatedAgainstInputHash: "hash-1",
    basePlanVersion: 1,
    lines: [{ id: "line-1", description: "Roof Replacement", tasks: [] }],
  });

  assert.equal(shouldOpenQuotePlanProposalReview(proposal), false);
});

test("QuoteExecutionPlanProposalReviewPanel guard hides apply action for zero-operation proposal", () => {
  const proposal = buildUncoordinatedDraftProposal({
    quoteId: "quote-1",
    generatedAgainstInputHash: "hash-1",
    basePlanVersion: 1,
    lines: [{ id: "line-1", description: "Roof Replacement", tasks: [] }],
  });

  assert.equal(shouldShowQuotePlanProposalApplyAction(proposal), false);
});

test("Quote-wide AI failure copy does not mention adjusting line item descriptions", () => {
  const message = toQuoteWidePlanGenerationError(
    "AI generated an invalid execution plan. Nothing was saved. Try again or adjust the line item description.",
  );

  assert.equal(message, QUOTE_PLAN_INVALID_AI_ERROR);
  assert.equal(/adjust the line item description/i.test(message), false);
});
