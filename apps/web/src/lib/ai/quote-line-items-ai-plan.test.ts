import assert from "node:assert/strict";
import test from "node:test";
import { validateQuoteScopeSuggestionsForApply } from "./quote-line-items-ai-plan";
import type { QuoteScopeSuggestionsProposal } from "./quote-line-items-proposal-schema";

const baseProposal: QuoteScopeSuggestionsProposal = {
  quoteId: "q1",
  sourceContextSummary: "Panel upgrade",
  assumptions: [],
  warnings: [],
  quoteJobContext: ["Locked side gate"],
  quoteMissingInfo: [],
  recommendedTemplates: [
    {
      tempId: "rt1",
      templateId: "tpl-a",
      templateDescription: "Main panel upgrade",
      confidence: "high",
    },
  ],
  commercialLineItems: [
    {
      tempId: "c1",
      description: "Main electrical service upgrade",
      confidence: "medium",
      lineItemDetails: [],
      executionPlanningNotes: [],
      missingInfo: [],
    },
  ],
  optionalAddOns: [
    {
      tempId: "o1",
      description: "Surge protector",
      whySeparate: "Optional add-on",
      confidence: "low",
    },
  ],
};

test("validateQuoteScopeSuggestionsForApply rejects empty selection", () => {
  const result = validateQuoteScopeSuggestionsForApply(
    baseProposal,
    {
      selectedTemplateIds: [],
      selectedCommercialLineItems: [],
      selectedOptionalAddOnIds: [],
      selectedQuoteJobContext: [],
    },
    ["tpl-a"],
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Select at least one/i);
  }
});

test("validateQuoteScopeSuggestionsForApply accepts quote job context only", () => {
  const result = validateQuoteScopeSuggestionsForApply(
    baseProposal,
    {
      selectedTemplateIds: [],
      selectedCommercialLineItems: [],
      selectedOptionalAddOnIds: [],
      selectedQuoteJobContext: ["Locked side gate"],
    },
    ["tpl-a"],
  );
  assert.equal(result.ok, true);
});

test("validateQuoteScopeSuggestionsForApply rejects unknown template ids", () => {
  const result = validateQuoteScopeSuggestionsForApply(
    baseProposal,
    {
      selectedTemplateIds: ["tpl-missing"],
      selectedCommercialLineItems: [],
      selectedOptionalAddOnIds: [],
      selectedQuoteJobContext: [],
    },
    ["tpl-a"],
  );
  assert.equal(result.ok, false);
});

test("validateQuoteScopeSuggestionsForApply accepts mixed template + commercial + optional", () => {
  const result = validateQuoteScopeSuggestionsForApply(
    baseProposal,
    {
      selectedTemplateIds: ["tpl-a"],
      selectedCommercialLineItems: [
        {
          tempId: "c1",
          description: "Main electrical service upgrade",
          lineItemDetails: [],
          executionPlanningNotes: [],
          missingInfo: [],
        },
      ],
      selectedOptionalAddOnIds: ["o1"],
      selectedQuoteJobContext: [],
    },
    ["tpl-a"],
  );
  assert.equal(result.ok, true);
});

test("validateQuoteScopeSuggestionsForApply rejects unknown commercial tempId", () => {
  const result = validateQuoteScopeSuggestionsForApply(
    baseProposal,
    {
      selectedTemplateIds: [],
      selectedCommercialLineItems: [
        {
          tempId: "missing",
          description: "Unknown",
          lineItemDetails: [],
          executionPlanningNotes: [],
          missingInfo: [],
        },
      ],
      selectedOptionalAddOnIds: [],
      selectedQuoteJobContext: [],
    },
    ["tpl-a"],
  );
  assert.equal(result.ok, false);
});

test("validateQuoteScopeSuggestionsForApply blocks simulated apply when disabled", () => {
  const result = validateQuoteScopeSuggestionsForApply(
    baseProposal,
    {
      selectedTemplateIds: ["tpl-a"],
      selectedCommercialLineItems: [],
      selectedOptionalAddOnIds: [],
      selectedQuoteJobContext: [],
    },
    ["tpl-a"],
    {
      isSimulated: true,
      canApply: false,
      applyBlockedReason: "Demo output blocked",
    },
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /Demo output blocked/);
  }
});
