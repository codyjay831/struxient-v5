import assert from "node:assert/strict";
import test from "node:test";
import {
  CLARIFICATION_INTERNAL_HEADER,
  mergeClarificationBlock,
} from "./clarification-scope-merge";

test("inserts a block into empty notes", () => {
  const result = mergeClarificationBlock(null, CLARIFICATION_INTERNAL_HEADER, [
    "New service size: 200A",
    "Trenching required: Yes",
  ]);
  assert.equal(
    result,
    `${CLARIFICATION_INTERNAL_HEADER}\n- New service size: 200A\n- Trenching required: Yes`,
  );
});

test("preserves existing notes and appends the block", () => {
  const result = mergeClarificationBlock(
    "Customer prefers mornings.",
    CLARIFICATION_INTERNAL_HEADER,
    ["New service size: 200A"],
  );
  assert.equal(
    result,
    `Customer prefers mornings.\n\n${CLARIFICATION_INTERNAL_HEADER}\n- New service size: 200A`,
  );
});

test("re-applying replaces the prior block (idempotent)", () => {
  const first = mergeClarificationBlock("Base note.", CLARIFICATION_INTERNAL_HEADER, [
    "New service size: 100A",
  ]);
  const second = mergeClarificationBlock(first, CLARIFICATION_INTERNAL_HEADER, [
    "New service size: 200A",
    "Service feed: Underground",
  ]);
  assert.equal(
    second,
    `Base note.\n\n${CLARIFICATION_INTERNAL_HEADER}\n- New service size: 200A\n- Service feed: Underground`,
  );
  // Old "100A" line is gone, base note retained.
  assert.equal(second?.includes("100A"), false);
  assert.equal(second?.includes("Base note."), true);
});

test("empty bullet list strips the block and keeps the base", () => {
  const withBlock = mergeClarificationBlock("Base note.", CLARIFICATION_INTERNAL_HEADER, [
    "New service size: 200A",
  ]);
  const cleared = mergeClarificationBlock(withBlock, CLARIFICATION_INTERNAL_HEADER, []);
  assert.equal(cleared, "Base note.");
});

test("empty result returns null", () => {
  const cleared = mergeClarificationBlock(null, CLARIFICATION_INTERNAL_HEADER, []);
  assert.equal(cleared, null);
});
