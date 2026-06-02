import assert from "node:assert/strict";
import test from "node:test";
import {
  appendQuoteJobContextToQuoteInternalNotes,
  mapCommercialSuggestionToLineFields,
} from "./quote-scope-suggestion-persist";
import { QuoteScopeSuggestionsProposalSchema } from "./quote-line-items-proposal-schema";

const serviceUpgradeFixture = {
  quoteId: "q1",
  quoteJobContext: ["Locked side gate", "Dog in yard", "Customer available after 3 PM on weekdays"],
  quoteMissingInfo: [],
  commercialLineItems: [
    {
      tempId: "c1",
      description: "Main electrical service upgrade",
      confidence: "high" as const,
      lineItemDetails: [
        {
          tempId: "d1",
          label: "Panel",
          content: "Existing panel appears to be Zinsco",
          audience: "internal" as const,
        },
        {
          tempId: "d2",
          label: "Grounding",
          content: "Verify grounding and bonding per code",
          audience: "internal" as const,
        },
        {
          tempId: "d3",
          label: "Utility",
          content: "Coordinate utility release and meter work",
          audience: "internal" as const,
        },
      ],
      executionPlanningNotes: ["Confirm proposed service amperage with customer"],
      missingInfo: ["Confirm existing service size", "Confirm proposed amperage"],
    },
  ],
  optionalAddOns: [
    {
      tempId: "o1",
      description: "EV-ready preparation",
      whySeparate: "Optional future upgrade",
      confidence: "medium" as const,
    },
    {
      tempId: "o2",
      description: "Exterior garage outlet",
      whySeparate: "Separate optional scope",
      confidence: "medium" as const,
    },
  ],
};

test("service upgrade fixture parses with three-layer fields", () => {
  const parsed = QuoteScopeSuggestionsProposalSchema.parse(serviceUpgradeFixture);
  assert.equal(parsed.commercialLineItems[0]!.description, "Main electrical service upgrade");
  assert.equal(parsed.quoteJobContext.length, 3);
  assert.equal(parsed.optionalAddOns.length, 2);
  assert.doesNotMatch(parsed.commercialLineItems[0]!.description, /Zinsco|gate|dog|3 PM/i);
});

test("service upgrade fixture persists line vs quote layers correctly", () => {
  const parsed = QuoteScopeSuggestionsProposalSchema.parse(serviceUpgradeFixture);
  const line = parsed.commercialLineItems[0]!;

  const fields = mapCommercialSuggestionToLineFields({
    tempId: line.tempId,
    description: line.description,
    customerScopeTitle: line.customerScopeTitle,
    customerScopeDescription: line.customerScopeDescription,
    lineItemDetails: line.lineItemDetails,
    executionPlanningNotes: line.executionPlanningNotes,
    missingInfo: line.missingInfo,
  });

  assert.doesNotMatch(fields.description, /Zinsco|gate|dog/i);
  assert.match(fields.internalNotes ?? "", /Zinsco/);
  assert.match(fields.internalNotes ?? "", /utility/i);
  assert.doesNotMatch(fields.internalNotes ?? "", /Locked side gate/);

  const quoteNotes = appendQuoteJobContextToQuoteInternalNotes(null, parsed.quoteJobContext);
  assert.match(quoteNotes ?? "", /Locked side gate/);
  assert.match(quoteNotes ?? "", /Dog in yard/);
  assert.doesNotMatch(quoteNotes ?? "", /Zinsco/);
});
