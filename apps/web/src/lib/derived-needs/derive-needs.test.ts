import assert from "node:assert/strict";
import test from "node:test";
import { deriveNeedsForQuoteLines } from "@/lib/derived-needs/derive-needs";

test("deriveNeedsForQuoteLines derives roofing materials from entered facts", () => {
  const needs = deriveNeedsForQuoteLines([
    {
      lineId: "line-1",
      clarifications: [
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
              questionKey: "roofing.replacement.waste_percent",
              questionLabelSnapshot: "Waste factor",
              inputType: "number",
              value: { kind: "number", value: 12, unit: "%" },
              customerFacing: false,
            },
            {
              questionSetKey: "roofing.replacement",
              questionSetVersion: 1,
              questionKey: "roofing.replacement.ridge_vent_lf",
              questionLabelSnapshot: "Ridge vent",
              inputType: "number",
              value: { kind: "number", value: 48, unit: "lf" },
              customerFacing: false,
            },
          ],
        },
      ],
    },
  ]);

  const bundles = needs.find((need) => need.name === "Shingle bundles");
  assert.ok(bundles);
  assert.equal(bundles?.unit, "bundle");
  assert.equal(bundles?.confidence, "known");

  const ridgeVent = needs.find((need) => need.name === "Ridge vent");
  assert.ok(ridgeVent);
  assert.equal(ridgeVent?.quantity, 48);
});

test("deriveNeedsForQuoteLines returns review warning when squares are missing", () => {
  const needs = deriveNeedsForQuoteLines([
    {
      lineId: "line-2",
      clarifications: [
        {
          questionSetKey: "roofing.replacement",
          questionSetVersion: 1,
          answers: [],
        },
      ],
    },
  ]);

  const warning = needs.find((need) => need.category === "review_warning");
  assert.ok(warning);
  assert.equal(warning?.confidence, "needs_review");
});
