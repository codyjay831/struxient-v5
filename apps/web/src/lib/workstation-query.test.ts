import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { deriveSchedulingAttentionOverride } from "./workstation-scheduling-attention";

test("deriveSchedulingAttentionOverride returns attention for ready scheduling task without timing", () => {
  const result = deriveSchedulingAttentionOverride({
    category: TaskTemplateCategory.SCHEDULING,
    derivedState: "READY",
    dueAt: null,
    scheduledStartAt: null,
  });

  assert.ok(result);
  assert.equal(result?.status, "Needs schedule");
  assert.equal(result?.priority, "high");
});

test("deriveSchedulingAttentionOverride ignores non-scheduling or already-timed tasks", () => {
  const nonScheduling = deriveSchedulingAttentionOverride({
    category: TaskTemplateCategory.GENERAL,
    derivedState: "READY",
    dueAt: null,
    scheduledStartAt: null,
  });
  const withDue = deriveSchedulingAttentionOverride({
    category: TaskTemplateCategory.SCHEDULING,
    derivedState: "READY",
    dueAt: new Date("2026-06-08T09:00:00.000Z"),
    scheduledStartAt: null,
  });

  assert.equal(nonScheduling, null);
  assert.equal(withDue, null);
});

