import assert from "node:assert/strict";
import test from "node:test";
import type { ScheduleEvent } from "@/lib/schedule-query";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import {
  BOARD_SCHEDULE_EVENT_ID_PREFIX,
  findOrBuildWorkItemForScheduleEvent,
  resolveWorkstationSelectedItem,
} from "./resolve-work-item-selection";

const baseScheduleEvent = (
  overrides: Partial<ScheduleEvent> = {},
): ScheduleEvent => ({
  id: "schedule-event-evt-1",
  kind: "job-schedule-event",
  title: "Site visit",
  startAt: new Date("2026-06-14T12:00:00Z"),
  endAt: new Date("2026-06-14T13:00:00Z"),
  recordId: "evt-1",
  parentId: "job-1",
  ...overrides,
});

const baseWorkItem = (
  overrides: Partial<WorkstationWorkItem> = {},
): WorkstationWorkItem => ({
  id: "schedule-event-missed-evt-1",
  kind: "schedule",
  title: "Missed visit",
  priority: "high",
  group: "investigate",
  lens: "attention",
  lane: "critical",
  withinLaneRank: 0,
  filterCategory: "jobs",
  reason: "Missed",
  nextStep: "Review",
  recordId: "evt-1",
  parentRecordId: "job-1",
  updatedAt: new Date(),
  ...overrides,
});

test("findOrBuildWorkItemForScheduleEvent: prefers existing schedule work item", () => {
  const existing = baseWorkItem();
  const event = baseScheduleEvent();
  const result = findOrBuildWorkItemForScheduleEvent(event, [existing]);
  assert.equal(result?.id, existing.id);
});

test("findOrBuildWorkItemForScheduleEvent: synthesizes board schedule item", () => {
  const event = baseScheduleEvent();
  const result = findOrBuildWorkItemForScheduleEvent(event, []);
  assert.ok(result);
  assert.equal(result?.kind, "schedule");
  assert.equal(result?.id, `${BOARD_SCHEDULE_EVENT_ID_PREFIX}evt-1`);
  assert.equal(result?.recordId, "evt-1");
  assert.equal(result?.parentRecordId, "job-1");
});

test("findOrBuildWorkItemForScheduleEvent: maps task due events to task items", () => {
  const taskItem = baseWorkItem({
    id: "task-task-1",
    kind: "task",
    recordId: "task-1",
  });
  const event = baseScheduleEvent({
    kind: "task",
    recordId: "task-1",
    parentId: "job-1",
  });
  const result = findOrBuildWorkItemForScheduleEvent(event, [taskItem]);
  assert.equal(result?.kind, "task");
  assert.equal(result?.recordId, "task-1");
});

test("resolveWorkstationSelectedItem: resolves synthetic board schedule selection", () => {
  const event = baseScheduleEvent();
  const selectedId = `${BOARD_SCHEDULE_EVENT_ID_PREFIX}evt-1`;
  const resolved = resolveWorkstationSelectedItem(selectedId, [], [event]);
  assert.equal(resolved?.kind, "schedule");
  assert.equal(resolved?.recordId, "evt-1");
});
