import assert from "node:assert/strict";
import test from "node:test";
import {
  appendQuickScopeObservationsToQuoteInternalNotes,
  appendQuoteJobContextToQuoteInternalNotes,
  mapCommercialSuggestionToLineFields,
  mapOptionalAddOnToLineFields,
  QUICK_SCOPE_INTERNAL_OBSERVATIONS_HEADER,
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
  assert.match(fields.internalNotes ?? "", /Execution planning notes:/);
  assert.match(fields.internalNotes ?? "", /Quick scope observations \(internal\):/);
  assert.match(fields.internalNotes ?? "", /Confirm existing service size/);
  assert.doesNotMatch(fields.internalNotes ?? "", /Locked side gate/);
});

test("mapCommercialSuggestionToLineFields sanitizes forbidden customer-facing uncertainty copy", () => {
  const fields = mapCommercialSuggestionToLineFields({
    tempId: "c1",
    description: "Roof replacement",
    customerScopeTitle: "Roof system details pending from missing info",
    customerScopeDescription:
      "Install roofing system with details pending from missing info and scope gap review.",
    lineItemDetails: [],
    executionPlanningNotes: [],
    missingInfo: [],
  });

  assert.doesNotMatch(fields.customerScopeTitle ?? "", /missing info|gap/i);
  assert.doesNotMatch(fields.customerScopeDescription ?? "", /missing info|gap/i);
});

test("mapCommercialSuggestionToLineFields strips marketing labels from customer-facing projection text", () => {
  const fields = mapCommercialSuggestionToLineFields({
    tempId: "c1",
    description: "Main Electrical Service Upgrade",
    customerScopeTitle: "[Hero] Main Electrical Service Upgrade",
    customerScopeDescription: "Install new service panel (Smart System) with utility coordination.",
    lineItemDetails: [],
    executionPlanningNotes: [],
    missingInfo: [],
  });

  assert.doesNotMatch(fields.customerScopeTitle ?? "", /\[[^\]]+\]|Hero/i);
  assert.doesNotMatch(fields.customerScopeDescription ?? "", /Smart System/i);
});

test("mapCommercialSuggestionToLineFields strips marketing labels from titles", () => {
  const fields = mapCommercialSuggestionToLineFields(
    {
      tempId: "c1",
      description: "[Hero] 200A Service Upgrade (Smart System)",
      customerScopeTitle: "[Recommended] 200A Service Upgrade (Premium)",
      customerScopeDescription: "Install upgraded panel.",
      lineItemDetails: [],
      executionPlanningNotes: [],
      missingInfo: [],
    },
    {
      sourceGroundingText: "Customer wants a 200 amp service upgrade.",
    },
  );

  assert.equal(fields.description, "200A Service Upgrade");
  assert.equal(fields.customerScopeTitle, "200A Service Upgrade");
  assert.doesNotMatch(fields.description, /\[Hero\]|Smart System/i);
  assert.doesNotMatch(fields.customerScopeTitle ?? "", /\[Recommended\]|Premium/i);
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

test("appendQuickScopeObservationsToQuoteInternalNotes stores hidden observations under one header", () => {
  const merged = appendQuickScopeObservationsToQuoteInternalNotes(null, [
    "Material selection not confirmed",
    "Permit inclusion not confirmed",
  ]);
  assert.match(merged ?? "", /Quick scope observations \(internal\):/);
  assert.match(merged ?? "", /Material selection not confirmed/);
  assert.match(merged ?? "", /Permit inclusion not confirmed/);
});

test("appendQuickScopeObservationsToQuoteInternalNotes avoids duplicate headers on rerun", () => {
  const first = appendQuickScopeObservationsToQuoteInternalNotes(null, [
    "Material selection not confirmed",
  ]);
  const second = appendQuickScopeObservationsToQuoteInternalNotes(first, [
    "Permit inclusion not confirmed",
  ]);

  const headerCount = (second?.split(QUICK_SCOPE_INTERNAL_OBSERVATIONS_HEADER).length ?? 1) - 1;
  assert.equal(headerCount, 1);
  assert.doesNotMatch(second ?? "", /Material selection not confirmed/);
  assert.match(second ?? "", /Permit inclusion not confirmed/);
});
