import assert from "node:assert/strict";
import test from "node:test";
import { recommendLineItemTemplates } from "./recommend-line-item-templates";

const candidates = [
  {
    id: "tpl-ev",
    description: "EV charger installation",
    tagNames: ["ev-charger", "electrical"],
    tagAliases: ["ev", "charger"],
    updatedAt: new Date(),
  },
  {
    id: "tpl-roof",
    description: "Roof replacement",
    tagNames: ["roofing"],
    tagAliases: [],
    updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
  },
];

test("recommendLineItemTemplates ranks relevant templates higher", () => {
  const matches = recommendLineItemTemplates(
    "Customer wants EV charger installed in garage with 240V electrical work",
    candidates,
  );

  assert.ok(matches.length >= 1);
  assert.equal(matches[0]!.templateId, "tpl-ev");
  assert.ok(matches[0]!.score > 0);
});

test("recommendLineItemTemplates returns empty for blank context", () => {
  const matches = recommendLineItemTemplates("   ", candidates);
  assert.deepEqual(matches, []);
});

test("recommendLineItemTemplates excludes low-score templates", () => {
  const matches = recommendLineItemTemplates(
    "completely unrelated plumbing fixture",
    candidates,
    { minScore: 0.5 },
  );
  assert.equal(matches.length, 0);
});
