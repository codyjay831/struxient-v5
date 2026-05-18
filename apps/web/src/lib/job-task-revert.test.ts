import assert from "node:assert/strict";
import test from "node:test";
import { JobTaskStatus } from "@prisma/client";
import {
  REVERT_BLOCKED_BY_DOWNSTREAM_MESSAGE,
  REVERT_ONLY_FROM_DONE_MESSAGE,
  assertCanRevertJobTaskToTodo,
  findDownstreamDoneTasksBlockingRevert,
  getSignalNamesSourcedByTask,
} from "./job-task-revert";

const TASK_A = "task-a";
const TASK_B = "task-b";

test("getSignalNamesSourcedByTask: includes only bus rows sourced by this task", () => {
  const names = getSignalNamesSourcedByTask(
    TASK_A,
    ["roof-ready", "permit-approved", "missing-on-bus"],
    [
      { name: "roof-ready", sourceJobTaskId: TASK_A },
      { name: "permit-approved", sourceJobTaskId: TASK_B },
    ],
  );

  assert.deepEqual(names, ["roof-ready"]);
});

test("getSignalNamesSourcedByTask: empty when task provides no signals", () => {
  assert.deepEqual(getSignalNamesSourcedByTask(TASK_A, [], []), []);
});

test("findDownstreamDoneTasksBlockingRevert: finds DONE tasks requiring retracted signals", () => {
  const blockers = findDownstreamDoneTasksBlockingRevert(
    ["roof-ready"],
    [
      { id: TASK_B, requiresSignals: ["roof-ready"] },
      { id: "task-c", requiresSignals: ["other-signal"] },
    ],
  );

  assert.equal(blockers.length, 1);
  assert.equal(blockers[0]?.id, TASK_B);
});

test("findDownstreamDoneTasksBlockingRevert: no blockers when retract list empty", () => {
  const blockers = findDownstreamDoneTasksBlockingRevert([], [
    { id: TASK_B, requiresSignals: ["roof-ready"] },
  ]);
  assert.equal(blockers.length, 0);
});

test("assertCanRevertJobTaskToTodo: allows revert when foreign source owns signal", () => {
  const result = assertCanRevertJobTaskToTodo({
    currentStatus: JobTaskStatus.DONE,
    taskId: TASK_A,
    providesSignals: ["roof-ready"],
    jobSignals: [{ name: "roof-ready", sourceJobTaskId: TASK_B }],
    downstreamDoneTasks: [{ id: TASK_B, requiresSignals: ["roof-ready"] }],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.signalNamesToRetract, []);
  }
});

test("assertCanRevertJobTaskToTodo: rejects when downstream DONE depends on owned signal", () => {
  const result = assertCanRevertJobTaskToTodo({
    currentStatus: JobTaskStatus.DONE,
    taskId: TASK_A,
    providesSignals: ["roof-ready"],
    jobSignals: [{ name: "roof-ready", sourceJobTaskId: TASK_A }],
    downstreamDoneTasks: [{ id: TASK_B, requiresSignals: ["roof-ready"] }],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, REVERT_BLOCKED_BY_DOWNSTREAM_MESSAGE);
  }
});

test("assertCanRevertJobTaskToTodo: allows safe retract when no downstream dependency", () => {
  const result = assertCanRevertJobTaskToTodo({
    currentStatus: JobTaskStatus.DONE,
    taskId: TASK_A,
    providesSignals: ["roof-ready"],
    jobSignals: [{ name: "roof-ready", sourceJobTaskId: TASK_A }],
    downstreamDoneTasks: [{ id: TASK_B, requiresSignals: ["other-signal"] }],
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.signalNamesToRetract, ["roof-ready"]);
  }
});

test("assertCanRevertJobTaskToTodo: rejects revert when task is not DONE", () => {
  const result = assertCanRevertJobTaskToTodo({
    currentStatus: JobTaskStatus.TODO,
    taskId: TASK_A,
    providesSignals: ["roof-ready"],
    jobSignals: [],
    downstreamDoneTasks: [],
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, REVERT_ONLY_FROM_DONE_MESSAGE);
  }
});
