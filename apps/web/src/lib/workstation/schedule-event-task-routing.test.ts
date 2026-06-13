import assert from "node:assert/strict";
import test from "node:test";
import { JobTaskStatus } from "@prisma/client";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import {
  findTaskWorkItemForScheduleEvent,
  pickPrimaryLinkedOpenTaskId,
  resolveExecutableWorkItem,
} from "./schedule-event-task-routing";

test("pickPrimaryLinkedOpenTaskId: returns first open linked task", () => {
  const taskId = pickPrimaryLinkedOpenTaskId([
    {
      jobTask: {
        id: "task-done",
        completedAt: new Date(),
        status: JobTaskStatus.DONE,
      },
    },
    {
      jobTask: {
        id: "task-open",
        completedAt: null,
        status: JobTaskStatus.TODO,
      },
    },
  ]);
  assert.equal(taskId, "task-open");
});

test("resolveExecutableWorkItem: schedule signal with linked task opens task item", () => {
  const taskItem: WorkstationWorkItem = {
    id: "task-task-open",
    kind: "task",
    title: "Site survey",
    priority: "high",
    group: "active",
    lens: "today",
    lane: "due",
    withinLaneRank: 0,
    filterCategory: "tasks",
    reason: "Due today",
    nextStep: "Complete the task.",
    recordId: "task-open",
    updatedAt: new Date(),
  };
  const scheduleItem: WorkstationWorkItem = {
    id: "schedule-event-missed-evt-1",
    kind: "schedule",
    title: "Site survey",
    priority: "high",
    group: "investigate",
    lens: "attention",
    lane: "critical",
    withinLaneRank: 0,
    filterCategory: "jobs",
    reason: "Missed commitment",
    nextStep: "Review event outcome",
    recordId: "evt-1",
    parentRecordId: "job-1",
    actionTaskId: "task-open",
    updatedAt: new Date(),
  };

  const resolved = resolveExecutableWorkItem(scheduleItem, [scheduleItem, taskItem]);
  assert.equal(resolved.kind, "task");
  assert.equal(resolved.recordId, "task-open");
});

test("findTaskWorkItemForScheduleEvent: maps event record id to task work item", () => {
  const taskItem: WorkstationWorkItem = {
    id: "task-task-open",
    kind: "task",
    title: "Site survey",
    priority: "high",
    group: "active",
    lens: "today",
    lane: "due",
    withinLaneRank: 0,
    filterCategory: "tasks",
    reason: "Due today",
    nextStep: "Complete the task.",
    recordId: "task-open",
    updatedAt: new Date(),
  };
  const scheduleItem: WorkstationWorkItem = {
    id: "schedule-event-missed-evt-1",
    kind: "schedule",
    title: "Site survey",
    priority: "high",
    group: "investigate",
    lens: "attention",
    lane: "critical",
    withinLaneRank: 0,
    filterCategory: "jobs",
    reason: "Missed commitment",
    nextStep: "Review event outcome",
    recordId: "evt-1",
    parentRecordId: "job-1",
    actionTaskId: "task-open",
    updatedAt: new Date(),
  };

  const found = findTaskWorkItemForScheduleEvent("evt-1", [scheduleItem, taskItem]);
  assert.equal(found?.id, "task-task-open");
});
