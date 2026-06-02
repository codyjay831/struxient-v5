import assert from "node:assert/strict";
import test from "node:test";
import {
  appendQuoteJobContextToQuoteInternalNotes,
  mapCommercialSuggestionToLineFields,
  mapOptionalAddOnToLineFields,
  QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER,
} from "./quote-scope-suggestion-persist";

test("mapCommercialSuggestionToLineFields maps line-specific sections", () => {
  const fields = mapCommercialSuggestionToLineFields({
    tempId: "c1",
    description: "Main electrical service upgrade",
    customerScopeTitle: "Panel upgrade",
    customerScopeDescription: "Upgrade main electrical panel to modern equipment.",
    lineItemDetails: [
      {
        tempId: "d1",
        label: "Panel",
        content: "Existing panel appears to be Zinsco",
        audience: "internal",
      },
      {
        tempId: "d2",
        content: "New 200A panel and breakers",
        audience: "customer",
      },
    ],
    executionPlanningNotes: ["Coordinate utility disconnect"],
    missingInfo: ["Confirm existing service size"],
  });

  assert.equal(fields.description, "Main electrical service upgrade");
  assert.doesNotMatch(fields.description, /Zinsco|gate|dog/i);
  assert.match(fields.internalNotes ?? "", /Line-specific details:/);
  assert.match(fields.internalNotes ?? "", /Zinsco/);
  assert.match(fields.internalNotes ?? "", /Missing info \(this line\):/);
  assert.match(fields.internalNotes ?? "", /Confirm existing service size/);
  assert.doesNotMatch(fields.internalNotes ?? "", /Locked side gate/);
});

test("mapOptionalAddOnToLineFields stores whySeparate in internalNotes", () => {
  const fields = mapOptionalAddOnToLineFields({
    description: "Whole-home surge protector",
    whySeparate: "Optional upgrade customer may decline",
  });

  assert.equal(fields.description, "Whole-home surge protector");
  assert.match(fields.internalNotes ?? "", /Optional add-on rationale/);
});

test("appendQuoteJobContextToQuoteInternalNotes adds header and bullets", () => {
  const merged = appendQuoteJobContextToQuoteInternalNotes(null, [
    "Locked side gate",
    "Dog in yard",
  ]);
  assert.match(merged ?? "", new RegExp(QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER));
  assert.match(merged ?? "", /Locked side gate/);
  assert.match(merged ?? "", /Dog in yard/);
});

test("appendQuoteJobContextToQuoteInternalNotes appends under existing header", () => {
  const existing = `${QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER}\n- Locked side gate`;
  const merged = appendQuoteJobContextToQuoteInternalNotes(existing, ["Dog in yard"]);
  assert.match(merged ?? "", /Dog in yard/);
  assert.equal((merged?.match(new RegExp(QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER, "g")) ?? []).length, 1);
});
