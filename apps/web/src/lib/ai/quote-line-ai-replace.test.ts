import assert from "node:assert/strict";
import test from "node:test";
import { resolveQuoteLineAiReplaceDeleteIds } from "./quote-line-ai-replace";

test("resolveQuoteLineAiReplaceDeleteIds deletes all when keep list empty", () => {
  const result = resolveQuoteLineAiReplaceDeleteIds(["a", "b", "c"], []);
  assert.deepEqual(result.deleteTaskIds, ["a", "b", "c"]);
  assert.deepEqual(result.normalizedKeepTaskIds, []);
});

test("resolveQuoteLineAiReplaceDeleteIds keeps selected and deletes others", () => {
  const result = resolveQuoteLineAiReplaceDeleteIds(["a", "b", "c"], ["b"]);
  assert.deepEqual(result.deleteTaskIds, ["a", "c"]);
  assert.deepEqual(result.normalizedKeepTaskIds, ["b"]);
});

test("resolveQuoteLineAiReplaceDeleteIds dedupes keep ids", () => {
  const result = resolveQuoteLineAiReplaceDeleteIds(["a", "b", "c"], ["b", "b"]);
  assert.deepEqual(result.deleteTaskIds, ["a", "c"]);
  assert.deepEqual(result.normalizedKeepTaskIds, ["b"]);
});

test("resolveQuoteLineAiReplaceDeleteIds throws for invalid keep ids", () => {
  assert.throws(
    () => resolveQuoteLineAiReplaceDeleteIds(["a", "b"], ["z"]),
    /INVALID_KEEP_TASKS/,
  );
});

