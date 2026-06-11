import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDueOnlyTaskTimingUpdate,
  buildScheduledBlockTaskTimingUpdate,
} from "./schedule-task-update";

test("buildDueOnlyTaskTimingUpdate updates due date without touching scheduled block", () => {
  const dueAt = new Date("2026-06-08T09:00:00.000Z");
  const payload = buildDueOnlyTaskTimingUpdate("task-1", dueAt, "user-1");

  assert.equal(payload.taskId, "task-1");
  assert.equal(payload.dueAt, dueAt);
  assert.equal(payload.scheduledStartAt, undefined);
  assert.equal(payload.scheduledEndAt, undefined);
  assert.equal(payload.assignedUserId, "user-1");
});

test("buildScheduledBlockTaskTimingUpdate updates block without touching due date", () => {
  const startAt = new Date("2026-06-08T10:00:00.000Z");
  const endAt = new Date("2026-06-08T12:00:00.000Z");
  const payload = buildScheduledBlockTaskTimingUpdate("task-2", startAt, endAt, null);

  assert.equal(payload.taskId, "task-2");
  assert.equal(payload.dueAt, undefined);
  assert.equal(payload.scheduledStartAt, startAt);
  assert.equal(payload.scheduledEndAt, endAt);
  assert.equal(payload.assignedUserId, null);
});

test("task timing builders reject schedule-event identifiers", () => {
  assert.throws(
    () =>
      buildDueOnlyTaskTimingUpdate(
        "schedule-event-evt_123",
        new Date("2026-06-08T09:00:00.000Z"),
      ),
    /task ID, not a schedule-event ID/i,
  );
  assert.throws(
    () =>
      buildScheduledBlockTaskTimingUpdate(
        "schedule-event-evt_456",
        new Date("2026-06-08T10:00:00.000Z"),
        new Date("2026-06-08T12:00:00.000Z"),
      ),
    /task ID, not a schedule-event ID/i,
  );
});

