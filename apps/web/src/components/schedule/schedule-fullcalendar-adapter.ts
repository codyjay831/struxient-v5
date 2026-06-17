import type { EventInput } from "@fullcalendar/core";
import type { ScheduleEvent } from "@/lib/schedule-query";
import type { ScheduleEventDisplayMode } from "./schedule-presentation";
import { buildAccessibleEventLabel, eventHasConflict } from "./schedule-presentation";

const BLOCK_CLASS: Record<string, string> = {
  BUSINESS_HOURS: "fc-event-block-business-hours",
  TIME_OFF: "fc-event-block-time-off",
  INTERNAL_EVENT: "fc-event-block-internal",
};

const KIND_CLASS: Record<ScheduleEvent["kind"], string> = {
  "job-schedule-event": "fc-event-job",
  "lead-visit-request": "fc-event-lead-visit",
  task: "fc-event-task",
  "schedule-block": "fc-event-block",
  "payment-overlay": "fc-event-payment",
};

export type ScheduleFullCalendarExtendedProps = {
  scheduleEvent: ScheduleEvent;
  displayMode: ScheduleEventDisplayMode;
  hasConflict: boolean;
  kindCategory: ScheduleEvent["kind"];
  accessibleLabel: string;
};

export function scheduleEventToFullCalendarInput(
  event: ScheduleEvent,
  conflictEventIds: Set<string> = new Set(),
  timeZone = "UTC",
): EventInput {
  const end =
    event.endAt ??
    (event.allDay
      ? new Date(event.startAt.getTime() + 24 * 60 * 60 * 1000)
      : new Date(event.startAt.getTime() + 60 * 60 * 1000));

  const hasConflict = eventHasConflict(event.id, conflictEventIds);
  const classNames = [KIND_CLASS[event.kind]];
  if (event.kind === "schedule-block" && event.status) {
    classNames.push(BLOCK_CLASS[event.status] ?? "fc-event-block-internal");
  }
  if (hasConflict) classNames.push("fc-event-conflict");
  if (event.kind === "job-schedule-event" && event.status === "TENTATIVE") {
    classNames.push("fc-event-tentative");
  }
  if (event.kind === "lead-visit-request" && event.status === "PENDING") {
    classNames.push("fc-event-pending-request");
  }
  if (event.kind === "task") {
    classNames.push("fc-event-deadline");
  }

  const extendedProps: ScheduleFullCalendarExtendedProps = {
    scheduleEvent: event,
    displayMode: "week",
    hasConflict,
    kindCategory: event.kind,
    accessibleLabel: buildAccessibleEventLabel(event, hasConflict, timeZone),
  };

  return {
    id: event.id,
    title: event.title,
    start: event.startAt,
    end,
    allDay: event.allDay ?? false,
    classNames,
    extendedProps,
  };
}

export function scheduleEventsToFullCalendarInputs(
  events: ScheduleEvent[],
  conflictEventIds: Set<string> = new Set(),
  timeZone = "UTC",
): EventInput[] {
  return events.map((event) => scheduleEventToFullCalendarInput(event, conflictEventIds, timeZone));
}
