import assert from "node:assert/strict";
import test from "node:test";
import {
  JobScheduleEventStatus,
  JobTaskStatus,
  TaskDueMode,
  TaskSchedulingRequirement,
} from "@prisma/client";
import {
  deriveReturnWorkCandidateTaskIds,
  deriveWorkPackageProgress,
  deriveEventPotentiallyMissed,
  deriveEventUpcoming,
  deriveTaskNeedsScheduling,
  deriveTaskOverdue,
  eventSatisfiesRequiredScheduling,
} from "./scheduling-derivation";

test("deriveEventPotentiallyMissed only flags confirmed events that ended", () => {
  const now = new Date("2026-06-11T12:00:00.000Z");

  assert.equal(
    deriveEventPotentiallyMissed(
      {
        status: JobScheduleEventStatus.CONFIRMED,
        startAt: new Date("2026-06-11T08:00:00.000Z"),
        endAt: new Date("2026-06-11T10:00:00.000Z"),
      },
      now,
    ),
    true,
  );

  assert.equal(
    deriveEventPotentiallyMissed(
      {
        status: JobScheduleEventStatus.TENTATIVE,
        startAt: new Date("2026-06-11T08:00:00.000Z"),
        endAt: new Date("2026-06-11T10:00:00.000Z"),
      },
      now,
    ),
    false,
  );
});

test("deriveEventUpcoming includes tentative/confirmed events with future end", () => {
  const now = new Date("2026-06-11T12:00:00.000Z");

  assert.equal(
    deriveEventUpcoming(
      {
        status: JobScheduleEventStatus.CONFIRMED,
        startAt: new Date("2026-06-11T11:00:00.000Z"),
        endAt: new Date("2026-06-11T13:00:00.000Z"),
      },
      now,
    ),
    true,
  );

  assert.equal(
    deriveEventUpcoming(
      {
        status: JobScheduleEventStatus.TENTATIVE,
        startAt: new Date("2026-06-12T09:00:00.000Z"),
        endAt: new Date("2026-06-12T10:00:00.000Z"),
      },
      now,
    ),
    true,
  );

  assert.equal(
    deriveEventUpcoming(
      {
        status: JobScheduleEventStatus.COMPLETED,
        startAt: new Date("2026-06-12T09:00:00.000Z"),
        endAt: new Date("2026-06-12T10:00:00.000Z"),
      },
      now,
    ),
    false,
  );
});

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

test("deriveWorkPackageProgress clamps between zero and one hundred", () => {
  assert.equal(deriveWorkPackageProgress({ totalTaskCount: 0, completedTaskCount: 0 }), 0);
  assert.equal(deriveWorkPackageProgress({ totalTaskCount: 4, completedTaskCount: 1 }), 25);
  assert.equal(deriveWorkPackageProgress({ totalTaskCount: 4, completedTaskCount: 9 }), 100);
});

test("deriveReturnWorkCandidateTaskIds returns only open linked tasks", () => {
  assert.deepEqual(
    deriveReturnWorkCandidateTaskIds({
      linkedTasks: [
        { taskId: "task-open", status: JobTaskStatus.TODO },
        { taskId: "task-done", status: JobTaskStatus.DONE },
      ],
    }),
    ["task-open"],
  );
});
