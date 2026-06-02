import assert from "node:assert/strict";
import test from "node:test";
import { normalizeScopeSuggestionGrouping } from "./normalize-scope-suggestion-grouping";
import type { QuoteScopeSuggestionsProposal } from "./quote-line-items-proposal-schema";

function baseProposal(
  commercialLineItems: QuoteScopeSuggestionsProposal["commercialLineItems"],
): QuoteScopeSuggestionsProposal {
  return {
    quoteId: "q1",
    assumptions: [],
    warnings: [],
    quoteJobContext: [],
    quoteMissingInfo: [],
    recommendedTemplates: [],
    commercialLineItems,
    optionalAddOns: [],
  };
}

test("normalizeScopeSuggestionGrouping merges execution-step rows into parent", () => {
  const result = normalizeScopeSuggestionGrouping(
    baseProposal([
      {
        tempId: "parent",
        description: "Main electrical panel upgrade",
        confidence: "high",
        lineItemDetails: [],
        executionPlanningNotes: [],
        missingInfo: [],
      },
      {
        tempId: "step",
        description: "Electrical permit filing",
        confidence: "medium",
        lineItemDetails: [],
        executionPlanningNotes: [],
        missingInfo: [],
      },
    ]),
  );

  assert.equal(result.commercialLineItems.length, 1);
  assert.equal(result.commercialLineItems[0]!.description, "Main electrical panel upgrade");
  assert.ok(
    result.commercialLineItems[0]!.lineItemDetails.some((d) =>
      /permit filing/i.test(d.content),
    ),
  );
  assert.ok(result.warnings.some((w) => /Merged execution step/i.test(w)));
});

test("normalizeScopeSuggestionGrouping reframes vague commercial rows", () => {
  const result = normalizeScopeSuggestionGrouping(
    baseProposal([
      {
        tempId: "vague",
        description: "Manage project logistics",
        confidence: "low",
        lineItemDetails: [],
        executionPlanningNotes: [],
        missingInfo: [],
      },
      {
        tempId: "parent",
        description: "Main panel upgrade",
        confidence: "high",
        lineItemDetails: [],
        executionPlanningNotes: [],
        missingInfo: [],
      },
    ]),
  );

  assert.equal(result.commercialLineItems.length, 1);
  assert.ok(
    result.commercialLineItems[0]!.lineItemDetails.some((d) =>
      /project logistics/i.test(d.content),
    ),
  );
});

test("normalizeScopeSuggestionGrouping dedupes near-duplicate parents", () => {
  const result = normalizeScopeSuggestionGrouping(
    baseProposal([
      {
        tempId: "a",
        description: "Main panel upgrade",
        confidence: "high",
        lineItemDetails: [{ tempId: "d1", content: "Remove old panel", audience: "internal" }],
        executionPlanningNotes: [],
        missingInfo: [],
      },
      {
        tempId: "b",
        description: "Main panel upgrade",
        confidence: "medium",
        lineItemDetails: [{ tempId: "d2", content: "Install new panel", audience: "internal" }],
        executionPlanningNotes: ["Verify grounding"],
        missingInfo: [],
      },
    ]),
  );

  assert.equal(result.commercialLineItems.length, 1);
  assert.equal(result.commercialLineItems[0]!.lineItemDetails.length, 2);
  assert.ok(result.warnings.some((w) => /duplicate commercial/i.test(w)));
});
