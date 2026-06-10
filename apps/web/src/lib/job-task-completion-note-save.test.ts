import assert from "node:assert/strict";
import test from "node:test";
import { JobTaskStatus } from "@prisma/client";
import {
  normalizeCompletionNoteDraft,
  validateCompletionNoteDraftSave,
} from "./job-task-completion-note-save";

test("normalizeCompletionNoteDraft: trims whitespace", () => {
  assert.equal(normalizeCompletionNoteDraft("  hello  "), "hello");
});

test("normalizeCompletionNoteDraft: empty string becomes null", () => {
  assert.equal(normalizeCompletionNoteDraft(""), null);
  assert.equal(normalizeCompletionNoteDraft("   "), null);
});

test("validateCompletionNoteDraftSave: rejects missing task", () => {
  const result = validateCompletionNoteDraftSave(null);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /not found/i);
  }
});

test("validateCompletionNoteDraftSave: rejects completed task", () => {
  const result = validateCompletionNoteDraftSave({ status: JobTaskStatus.DONE });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /completed task/i);
  }
});

test("validateCompletionNoteDraftSave: accepts TODO task", () => {
  const result = validateCompletionNoteDraftSave({ status: JobTaskStatus.TODO });
  assert.equal(result.ok, true);
});
