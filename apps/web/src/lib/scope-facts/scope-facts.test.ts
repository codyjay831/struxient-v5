import assert from "node:assert/strict";
import test from "node:test";
import type { LineClarificationAnswers } from "@/lib/clarification/clarification-types";
import { toScopeFactsFromLineClarifications } from "@/lib/scope-facts/scope-facts";

const SAMPLE_CLARIFICATIONS: LineClarificationAnswers[] = [
  {
    questionSetKey: "roofing.replacement",
    questionSetVersion: 1,
    answers: [
      {
        questionSetKey: "roofing.replacement",
        questionSetVersion: 1,
        questionKey: "roofing.replacement.squares",
        questionLabelSnapshot: "Roof area",
        inputType: "number",
        value: { kind: "number", value: 34, unit: "sq" },
        customerFacing: true,
      },
      {
        questionSetKey: "roofing.replacement",
        questionSetVersion: 1,
        questionKey: "roofing.replacement.sheathing_sheets",
        questionLabelSnapshot: "Sheathing sheets",
        inputType: "number",
        value: { kind: "unknown" },
        customerFacing: false,
      },
    ],
  },
];

test("toScopeFactsFromLineClarifications converts answers into normalized facts", () => {
  const facts = toScopeFactsFromLineClarifications("line-1", SAMPLE_CLARIFICATIONS);
  assert.equal(facts.length, 2);
  assert.equal(facts[0]?.source.quoteLineItemId, "line-1");
  assert.equal(facts[0]?.questionKey, "roofing.replacement.squares");
  assert.equal(facts[0]?.confidence, "known");
  assert.equal(facts[0]?.unit, "sq");
  assert.equal(facts[1]?.confidence, "needs_review");
});
