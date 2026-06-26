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

test("normalizeScopeSuggestionGrouping caps single-line observations to high-value max 3", () => {
  const result = normalizeScopeSuggestionGrouping(
    baseProposal([
      {
        tempId: "roof-1",
        description: "Roof replacement",
        confidence: "high",
        lineItemDetails: [],
        executionPlanningNotes: [],
        missingInfo: [
          "Roofing material/color not selected",
          "Sheathing/decking replacement policy unclear",
          "Permit/inspection inclusion unclear",
          "Gate code missing",
          "Site access unclear",
        ],
      },
    ]),
  );

  assert.equal(result.commercialLineItems[0]?.missingInfo.length, 3);
  const joined = result.commercialLineItems[0]?.missingInfo.join(" | ") ?? "";
  assert.doesNotMatch(joined, /gate code|site access/i);
});

test("normalizeScopeSuggestionGrouping enforces multi-line observation caps", () => {
  const line = (id: string) => ({
    tempId: id,
    description: `Line ${id}`,
    confidence: "medium" as const,
    lineItemDetails: [],
    executionPlanningNotes: [],
    missingInfo: [
      "Material selection unclear",
      "Warranty inclusion unclear",
      "Price allowance assumptions unclear",
    ],
  });
  const result = normalizeScopeSuggestionGrouping(baseProposal([line("a"), line("b"), line("c")]));
  const counts = result.commercialLineItems.map((item) => item.missingInfo.length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  assert.ok(counts.every((count) => count <= 2));
  assert.ok(total <= 6);
});

test("normalizeScopeSuggestionGrouping collapses observations for 5+ lines into one summary note", () => {
  const lines = Array.from({ length: 5 }, (_, i) => ({
    tempId: `l${i + 1}`,
    description: `Line ${i + 1}`,
    confidence: "medium" as const,
    lineItemDetails: [],
    executionPlanningNotes: [],
    missingInfo: ["Material selection unclear", "Permit inclusion unclear"],
  }));
  const result = normalizeScopeSuggestionGrouping(baseProposal(lines));
  assert.ok(result.commercialLineItems.every((item) => item.missingInfo.length === 0));
  assert.equal(result.quoteMissingInfo.length, 1);
  assert.match(result.quoteMissingInfo[0] ?? "", /Multiple work areas detected/i);
});

test("normalizeScopeSuggestionGrouping sanitizes marketing labels in commercial titles", () => {
  const result = normalizeScopeSuggestionGrouping({
    ...baseProposal([
      {
        tempId: "c1",
        description: "[Hero] 200A Service Upgrade (Smart System)",
        customerScopeTitle: "[Recommended] 200A Service Upgrade (Premium)",
        confidence: "high",
        lineItemDetails: [],
        executionPlanningNotes: [],
        missingInfo: [],
      },
    ]),
    sourceContextSummary: "Customer wants a 200 amp service upgrade.",
  });

  assert.equal(result.commercialLineItems[0]?.description, "200A Service Upgrade");
  assert.equal(result.commercialLineItems[0]?.customerScopeTitle, "200A Service Upgrade");
  assert.doesNotMatch(result.commercialLineItems[0]?.description ?? "", /\[Hero\]|Smart System/i);
});
