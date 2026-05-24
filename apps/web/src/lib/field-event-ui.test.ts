import test from "node:test";
import assert from "node:assert/strict";
import { JobTaskStatus } from "@prisma/client";
import { deriveTaskState } from "@/lib/task-readiness";
import {
  CANCEL_FIELD_HOLD_CONFIRM_BODY,
  CANCEL_FIELD_HOLD_CONFIRM_TITLE,
  FIELD_HOLD_LIFECYCLE_COPY,
  getFieldEventSignal,
  getSignalBlockedWaitingCopy,
  isFieldEventSignal,
  isFieldEventTaskTitle,
  isRemovableFieldEventTask,
  removeEventSignalFromRequires,
  shouldShowCancelFieldHold,
} from "@/lib/field-event-ui";

test("isFieldEventTaskTitle detects EVENT prefix", () => {
  assert.equal(isFieldEventTaskTitle("EVENT: Site Access Hold"), true);
  assert.equal(isFieldEventTaskTitle(" event: Lowercase prefix"), true);
  assert.equal(isFieldEventTaskTitle("Install trim"), false);
});

test("isFieldEventSignal detects event signals", () => {
  assert.equal(isFieldEventSignal("event:abc123"), true);
  assert.equal(isFieldEventSignal("inspection:final:passed"), false);
});

test("getSignalBlockedWaitingCopy prefers field hold copy for event signals", () => {
  assert.equal(
    getSignalBlockedWaitingCopy(["event:abc123"]),
    "Complete field hold to unblock this task",
  );
  assert.equal(
    getSignalBlockedWaitingCopy(["inspection:rough:passed"]),
    "Waiting for required prior work",
  );
});

test("getFieldEventSignal returns first event signal", () => {
  assert.equal(getFieldEventSignal(["event:abc", "other"]), "event:abc");
  assert.equal(getFieldEventSignal(["inspection:pass"]), undefined);
});

test("isRemovableFieldEventTask requires EVENT title and event signal", () => {
  assert.equal(isRemovableFieldEventTask("EVENT: Hold", ["event:abc"]), true);
  assert.equal(isRemovableFieldEventTask("Install trim", ["event:abc"]), false);
  assert.equal(isRemovableFieldEventTask("EVENT: Hold", ["inspection:pass"]), false);
});

test("removeEventSignalFromRequires removes only the target signal", () => {
  assert.deepEqual(
    removeEventSignalFromRequires(["event:abc", "other"], "event:abc"),
    ["other"],
  );
  assert.deepEqual(
    removeEventSignalFromRequires(["event:abc"], "event:xyz"),
    ["event:abc"],
  );
});

test("shouldShowCancelFieldHold is available only for open EVENT tasks", () => {
  assert.equal(
    shouldShowCancelFieldHold({ isFieldHoldTask: true, isCompleted: false }),
    true,
  );
  assert.equal(
    shouldShowCancelFieldHold({ isFieldHoldTask: true, isCompleted: true }),
    false,
  );
  assert.equal(
    shouldShowCancelFieldHold({ isFieldHoldTask: false, isCompleted: false }),
    false,
  );
});

test("field hold lifecycle copy distinguishes complete vs cancel", () => {
  assert.match(FIELD_HOLD_LIFECYCLE_COPY, /Complete it when the hold condition is satisfied/);
  assert.match(FIELD_HOLD_LIFECYCLE_COPY, /cancel it if the hold is no longer needed/);
  assert.match(CANCEL_FIELD_HOLD_CONFIRM_TITLE, /Cancel field hold/);
  assert.match(CANCEL_FIELD_HOLD_CONFIRM_BODY, /remove the hold and unblock tasks/);
});

test("readiness: downstream task unblocks after event signal removed from requires", () => {
  const eventSignal = "event:abc123";
  const requiresAfterCancel = removeEventSignalFromRequires([eventSignal], eventSignal);
  const state = deriveTaskState(
    {
      status: JobTaskStatus.TODO,
      completedAt: null,
      completionNote: null,
      completionRequirementsJson: {},
      attachments: [],
      requiresSignals: requiresAfterCancel,
      issues: [],
      stage: { requiresSignals: [], issues: [] },
    },
    [],
  );
  assert.equal(state, "READY");
});

test("readiness: downstream task stays blocked while event signal required", () => {
  const state = deriveTaskState(
    {
      status: JobTaskStatus.TODO,
      completedAt: null,
      completionNote: null,
      completionRequirementsJson: {},
      attachments: [],
      requiresSignals: ["event:abc123"],
      issues: [],
      stage: { requiresSignals: [], issues: [] },
    },
    [],
  );
  assert.equal(state, "BLOCKED_BY_SIGNAL");
});

test("readiness: downstream task unblocks when event signal published via completion", () => {
  const eventSignal = "event:abc123";
  const state = deriveTaskState(
    {
      status: JobTaskStatus.TODO,
      completedAt: null,
      completionNote: null,
      completionRequirementsJson: {},
      attachments: [],
      requiresSignals: [eventSignal],
      issues: [],
      stage: { requiresSignals: [], issues: [] },
    },
    [eventSignal],
  );
  assert.equal(state, "READY");
});
