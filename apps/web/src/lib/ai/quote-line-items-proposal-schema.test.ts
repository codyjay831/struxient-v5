import assert from "node:assert/strict";
import test from "node:test";
import { QuoteScopeSuggestionsProposalSchema } from "./quote-line-items-proposal-schema";

test("QuoteScopeSuggestionsProposalSchema parses minimal grouped proposal", () => {
  const parsed = QuoteScopeSuggestionsProposalSchema.parse({
    quoteId: "q1",
    recommendedTemplates: [],
    commercialLineItems: [],
    optionalAddOns: [],
  });
  assert.equal(parsed.quoteId, "q1");
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(parsed.quoteJobContext, []);
  assert.deepEqual(parsed.quoteMissingInfo, []);
});

test("QuoteScopeSuggestionsProposalSchema accepts three-layer electrical example", () => {
  const parsed = QuoteScopeSuggestionsProposalSchema.parse({
    quoteId: "q1",
    sourceContextSummary: "Zinsco panel upgrade with utility coordination",
    quoteJobContext: ["Locked side gate", "Dog in yard"],
    quoteMissingInfo: ["Confirm utility provider timeline"],
    recommendedTemplates: [
      {
        tempId: "t1",
        templateId: "tpl-1",
        templateDescription: "Main panel upgrade",
        confidence: "high",
        reasoning: "tag overlap",
      },
    ],
    commercialLineItems: [
      {
        tempId: "c1",
        description: "Main electrical service upgrade",
        confidence: "high",
        lineItemDetails: [
          {
            tempId: "d1",
            label: "Panel",
            content: "Existing panel appears to be Zinsco",
            audience: "internal",
          },
        ],
        executionPlanningNotes: ["Verify grounding meets current code"],
        missingInfo: ["Confirm existing service size (100A vs 200A)"],
      },
    ],
    optionalAddOns: [
      {
        tempId: "o1",
        description: "Whole-home surge protector",
        whySeparate: "Optional upgrade customer may decline",
        confidence: "medium",
      },
    ],
    warnings: ["Permit timeline unknown"],
  });

  assert.equal(parsed.recommendedTemplates.length, 1);
  assert.equal(parsed.commercialLineItems.length, 1);
  assert.equal(parsed.commercialLineItems[0]!.missingInfo[0], "Confirm existing service size (100A vs 200A)");
  assert.equal(parsed.quoteJobContext[0], "Locked side gate");
  assert.equal(parsed.quoteMissingInfo[0], "Confirm utility provider timeline");
});

test("QuoteScopeSuggestionsProposalSchema rejects empty commercial description", () => {
  assert.throws(() =>
    QuoteScopeSuggestionsProposalSchema.parse({
      quoteId: "q1",
      commercialLineItems: [{ tempId: "c1", description: "" }],
    }),
  );
});
