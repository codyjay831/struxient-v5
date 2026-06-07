import test from "node:test";
import assert from "node:assert/strict";
import { hasBreakingClarificationChanges } from "./clarification-versioning";

test("returns false for non-breaking label-only edits", () => {
  const previous = [
    { key: "service.size", inputType: "single_choice", options: [{ key: "200a" }, { key: "400a" }] },
  ];
  const next = [
    { key: "service.size", inputType: "single_choice", options: [{ key: "200a" }, { key: "400a" }] },
  ];
  assert.equal(hasBreakingClarificationChanges(previous, next), false);
});

test("returns true when question input type changes", () => {
  const previous = [{ key: "service.size", inputType: "single_choice", options: [] }];
  const next = [{ key: "service.size", inputType: "number", options: [] }];
  assert.equal(hasBreakingClarificationChanges(previous, next), true);
});

test("returns true when options change", () => {
  const previous = [{ key: "service.size", inputType: "single_choice", options: [{ key: "200a" }] }];
  const next = [{ key: "service.size", inputType: "single_choice", options: [{ key: "400a" }] }];
  assert.equal(hasBreakingClarificationChanges(previous, next), true);
});
