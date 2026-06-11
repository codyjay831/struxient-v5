import assert from "node:assert/strict";
import test from "node:test";
import {
  JobScheduleEventStatus,
  TaskSchedulingRequirement,
} from "@prisma/client";
import { deriveUnscheduledTaskItems } from "./schedule-unscheduled-tasks";
import { hasActiveCanonicalTaskScheduleLink } from "./schedule-query";

test("deriveUnscheduledTaskItems excludes blocked/non-ready tasks", () => {
  const items = deriveUnscheduledTaskItems([
    {
      id: "task-ready",
      title: "Ready task",
      jobId: "job-1",
      jobTitle: "Kitchen Remodel",
      schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
      dueAt: null,
      updatedAt: new Date("2026-06-08T08:00:00.000Z"),
      linkedEvents: [],
      state: "READY",
    },
    {
      id: "task-blocked",
      title: "Blocked task",
      jobId: "job-1",
      jobTitle: "Kitchen Remodel",
      schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
      dueAt: null,
      updatedAt: new Date("2026-06-08T09:00:00.000Z"),
      linkedEvents: [],
      state: "BLOCKED_BY_SIGNAL",
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].recordId, "task-ready");
});

test("deriveUnscheduledTaskItems ignores OPTIONAL requirement", () => {
  const items = deriveUnscheduledTaskItems([
    {
      id: "task-optional",
      title: "Optional task",
      jobId: "job-1",
      jobTitle: "Kitchen Remodel",
      schedulingRequirement: TaskSchedulingRequirement.OPTIONAL,
      dueAt: null,
      updatedAt: new Date("2026-06-08T08:00:00.000Z"),
      linkedEvents: [],
      state: "READY",
    },
  ]);

  assert.equal(items.length, 0);
});

test("deriveUnscheduledTaskItems ignores tasks with qualifying confirmed event", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");
  const items = deriveUnscheduledTaskItems(
    [
    {
      id: "task-scheduled",
      title: "Scheduled task",
      jobId: "job-1",
      jobTitle: "Main Panel Upgrade",
      schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
      dueAt: null,
      updatedAt: new Date("2026-06-08T09:00:00.000Z"),
      linkedEvents: [
        {
          id: "evt-1",
          status: JobScheduleEventStatus.CONFIRMED,
          startAt: new Date("2026-06-09T08:00:00.000Z"),
          endAt: new Date("2026-06-09T14:00:00.000Z"),
        },
      ],
      state: "READY",
    },
    ],
    now,
  );

  assert.equal(items.length, 0);
});

test("hasActiveCanonicalTaskScheduleLink only matches tentative/confirmed links", () => {
  assert.equal(
    hasActiveCanonicalTaskScheduleLink([
      {
        jobScheduleEvent: {
          status: JobScheduleEventStatus.TENTATIVE,
        },
      },
    ]),
    true,
  );
  assert.equal(
    hasActiveCanonicalTaskScheduleLink([
      {
        jobScheduleEvent: {
          status: JobScheduleEventStatus.CONFIRMED,
        },
      },
    ]),
    true,
  );
  assert.equal(
    hasActiveCanonicalTaskScheduleLink([
      {
        jobScheduleEvent: {
          status: JobScheduleEventStatus.COMPLETED,
        },
      },
      {
        jobScheduleEvent: {
          status: JobScheduleEventStatus.CANCELED,
        },
      },
    ]),
    false,
  );
});
