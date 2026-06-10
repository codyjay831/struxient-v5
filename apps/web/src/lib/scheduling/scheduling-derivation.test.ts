import assert from "node:assert/strict";
import test from "node:test";
import {
  JobScheduleEventStatus,
  JobTaskStatus,
  TaskDueMode,
  TaskSchedulingRequirement,
} from "@prisma/client";
import {
  deriveTaskNeedsScheduling,
  deriveTaskOverdue,
  eventSatisfiesRequiredScheduling,
} from "./scheduling-derivation";

test("eventSatisfiesRequiredScheduling requires confirmed future end", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");
  assert.equal(
    eventSatisfiesRequiredScheduling(
      {
        id: "1",
        status: JobScheduleEventStatus.CONFIRMED,
        startAt: new Date("2026-06-09T08:00:00.000Z"),
        endAt: new Date("2026-06-09T14:00:00.000Z"),
      },
      now,
    ),
    true,
  );
  assert.equal(
    eventSatisfiesRequiredScheduling(
      {
        id: "2",
        status: JobScheduleEventStatus.TENTATIVE,
        startAt: new Date("2026-06-09T08:00:00.000Z"),
        endAt: new Date("2026-06-09T14:00:00.000Z"),
      },
      now,
    ),
    false,
  );
});

test("deriveTaskNeedsScheduling follows canon gate", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");
  assert.equal(
    deriveTaskNeedsScheduling(
      {
        status: JobTaskStatus.TODO,
        derivedState: "READY",
        schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
        linkedEvents: [],
      },
      now,
    ),
    true,
  );
  assert.equal(
    deriveTaskNeedsScheduling(
      {
        status: JobTaskStatus.TODO,
        derivedState: "BLOCKED_BY_ISSUE",
        schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
        linkedEvents: [],
      },
      now,
    ),
    false,
  );
});

test("deriveTaskOverdue respects NONE mode", () => {
  assert.equal(
    deriveTaskOverdue(
      {
        dueAt: new Date("2020-01-01T00:00:00.000Z"),
        dueMode: TaskDueMode.NONE,
        dueGranularity: null,
      },
      "America/Los_Angeles",
      new Date("2026-06-09T12:00:00.000Z"),
    ),
    false,
  );
});
