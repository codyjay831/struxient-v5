import assert from "node:assert/strict";
import test from "node:test";
import type { ScheduleEvent } from "@/lib/schedule-query";
import { scheduleEventToFullCalendarInput } from "@/components/schedule/schedule-fullcalendar-adapter";
import type { ScheduleFullCalendarExtendedProps } from "@/components/schedule/schedule-fullcalendar-adapter";

test("scheduleEventToFullCalendarInput maps job events with class names and typed extended props", () => {
  const event: ScheduleEvent = {
    id: "schedule-event-evt-1",
    kind: "job-schedule-event",
    title: "Panel install",
    status: "CONFIRMED",
    startAt: new Date("2026-06-17T15:00:00.000Z"),
    endAt: new Date("2026-06-17T17:00:00.000Z"),
    recordId: "evt-1",
    parentId: "job-1",
  };

  const mapped = scheduleEventToFullCalendarInput(event);
  assert.equal(mapped.id, event.id);
  assert.equal(mapped.title, "Panel install");
  assert.ok(mapped.classNames?.includes("fc-event-job"));

  const props = mapped.extendedProps as ScheduleFullCalendarExtendedProps;
  assert.equal(props.scheduleEvent.id, event.id);
  assert.equal(props.kindCategory, "job-schedule-event");
  assert.equal(props.hasConflict, false);
  assert.ok(props.accessibleLabel.includes("Panel install"));
});

test("scheduleEventToFullCalendarInput marks conflicts and tentative styling", () => {
  const event: ScheduleEvent = {
    id: "schedule-event-evt-2",
    kind: "job-schedule-event",
    title: "Rough-in",
    status: "TENTATIVE",
    startAt: new Date("2026-06-17T15:00:00.000Z"),
    endAt: new Date("2026-06-17T17:00:00.000Z"),
    recordId: "evt-2",
    parentId: "job-1",
  };

  const conflictIds = new Set(["schedule-event-evt-2"]);
  const mapped = scheduleEventToFullCalendarInput(event, conflictIds, "America/Los_Angeles");
  assert.ok(mapped.classNames?.includes("fc-event-conflict"));
  assert.ok(mapped.classNames?.includes("fc-event-tentative"));
  const props = mapped.extendedProps as ScheduleFullCalendarExtendedProps;
  assert.equal(props.hasConflict, true);
});

test("scheduleEventToFullCalendarInput maps schedule block types", () => {
  const event: ScheduleEvent = {
    id: "schedule-block-block-1",
    kind: "schedule-block",
    title: "Office closed",
    status: "TIME_OFF",
    startAt: new Date("2026-06-17T15:00:00.000Z"),
    endAt: new Date("2026-06-17T22:00:00.000Z"),
    recordId: "block-1",
  };

  const mapped = scheduleEventToFullCalendarInput(event);
  assert.ok(mapped.classNames?.includes("fc-event-block-time-off"));
});
