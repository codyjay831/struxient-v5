import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_SEARCH_LENGTH,
  normalizePageQuery,
  shortId,
  toPageResult,
} from "./platform-pagination";
import { toRedactedAiFailure, toRedactedNotificationFailure } from "./platform-redaction";

test("normalizePageQuery clamps page size and ignores short search", () => {
  const result = normalizePageQuery({ page: 0, pageSize: 999, q: "a" });
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, MAX_PAGE_SIZE);
  assert.equal(result.q, null);
});

test("normalizePageQuery accepts search at minimum length", () => {
  const q = "x".repeat(MIN_SEARCH_LENGTH);
  const result = normalizePageQuery({ q });
  assert.equal(result.q, q);
  assert.equal(result.pageSize, DEFAULT_PAGE_SIZE);
});

test("toPageResult computes total pages", () => {
  const result = toPageResult(["a", "b"], 50, 1, 25);
  assert.equal(result.totalPages, 2);
  assert.equal(result.totalCount, 50);
});

test("shortId returns trailing characters", () => {
  assert.equal(shortId("clabcdefghijklmnop"), "ijklmnop");
});

test("toRedactedAiFailure truncates long error messages", () => {
  const failure = toRedactedAiFailure({
    id: "ai-1",
    feature: "quote_scope",
    provider: "openai",
    model: "gpt-4",
    status: "error",
    errorMessage: "x".repeat(600),
    createdAt: new Date(),
  });

  assert.ok(failure.errorMessage);
  assert.equal(failure.errorMessage.length, 501);
});

test("toRedactedNotificationFailure preserves short errors", () => {
  const failure = toRedactedNotificationFailure({
    id: "n-1",
    kind: "email",
    title: "Quote sent",
    errorMessage: "SMTP timeout",
    createdAt: new Date(),
  });

  assert.equal(failure.errorMessage, "SMTP timeout");
});
