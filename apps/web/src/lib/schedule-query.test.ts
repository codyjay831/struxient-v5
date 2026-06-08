import assert from "node:assert/strict";
import test from "node:test";
import { TaskTemplateCategory } from "@prisma/client";
import { deriveUnscheduledTaskItems } from "./schedule-unscheduled-tasks";

test("deriveUnscheduledTaskItems excludes blocked/non-ready tasks", () => {
  const items = deriveUnscheduledTaskItems([
    {
      id: "task-ready",
      title: "Ready task",
      jobId: "job-1",
      jobTitle: "Kitchen Remodel",
      category: TaskTemplateCategory.GENERAL,
      dueAt: null,
      updatedAt: new Date("2026-06-08T08:00:00.000Z"),
      state: "READY",
    },
    {
      id: "task-blocked",
      title: "Blocked task",
      jobId: "job-1",
      jobTitle: "Kitchen Remodel",
      category: TaskTemplateCategory.SCHEDULING,
      dueAt: null,
      updatedAt: new Date("2026-06-08T09:00:00.000Z"),
      state: "BLOCKED_BY_SIGNAL",
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].recordId, "task-ready");
});

test("deriveUnscheduledTaskItems prioritizes scheduling tasks", () => {
  const items = deriveUnscheduledTaskItems([
    {
      id: "task-general",
      title: "Prep tools",
      jobId: "job-1",
      jobTitle: "Main Panel Upgrade",
      category: TaskTemplateCategory.GENERAL,
      dueAt: new Date("2026-06-09T08:00:00.000Z"),
      updatedAt: new Date("2026-06-08T10:00:00.000Z"),
      state: "READY",
    },
    {
      id: "task-scheduling",
      title: "Coordinate utility window",
      jobId: "job-1",
      jobTitle: "Main Panel Upgrade",
      category: TaskTemplateCategory.SCHEDULING,
      dueAt: null,
      updatedAt: new Date("2026-06-08T09:00:00.000Z"),
      state: "READY",
    },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].recordId, "task-scheduling");
  assert.match(items[0].reason, /coordination task/i);
});

