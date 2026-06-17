import type { ScheduleConflict, ScheduleEvent, ScheduleEventKind } from "@/lib/schedule-query";
import type { ScheduleUrlView } from "@/lib/scheduling/schedule-url-state";
import { parseDateOnlyAnchor } from "@/lib/scheduling/deadline-timezone";
import { getAgendaRange, getWeekRange } from "@/lib/scheduling/schedule-range";

export type ScheduleEventDisplayMode = "month" | "week" | "day" | "agenda" | "allDay";

const KIND_LABELS: Record<ScheduleEventKind, string> = {
  "job-schedule-event": "Job commitment",
  "lead-visit-request": "Estimate visit",
  task: "Task deadline",
  "schedule-block": "Schedule block",
  "payment-overlay": "Payment",
};

export function buildConflictEventIdSet(conflicts: ScheduleConflict[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of conflicts) {
    for (const eventId of conflict.eventIds) {
      ids.add(eventId);
    }
  }
  return ids;
}

export function eventHasConflict(eventId: string, conflictEventIds: Set<string>): boolean {
  return conflictEventIds.has(eventId);
}

export function getScheduleKindLabel(kind: ScheduleEventKind): string {
  return KIND_LABELS[kind];
}

export function getScheduleStatusLabel(event: ScheduleEvent): string | null {
  if (!event.status) return null;
  if (event.kind === "job-schedule-event" && event.status === "TENTATIVE") return "Tentative";
  if (event.kind === "lead-visit-request" && event.status === "PENDING") return "Request";
  if (event.kind === "task" && event.status === "Due") return "Deadline";
  if (event.kind === "schedule-block") {
    return event.status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return event.status.replaceAll("_", " ");
}

export function isTentativeOrPending(event: ScheduleEvent): boolean {
  return (
    (event.kind === "job-schedule-event" && event.status === "TENTATIVE") ||
    (event.kind === "lead-visit-request" && event.status === "PENDING")
  );
}

function formatDateInTimezone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
}

/** Period heading from canonical URL view + date — not FullCalendar internal state. */
export function formatSchedulePeriodTitle(
  view: ScheduleUrlView,
  anchorDate: string,
  timeZone: string,
): string {
  const anchor = parseDateOnlyAnchor(anchorDate, timeZone);

  switch (view) {
    case "month":
      return formatDateInTimezone(anchor, timeZone, { month: "long", year: "numeric" });
    case "week": {
      const range = getWeekRange(anchorDate, timeZone);
      const end = new Date(range.endExclusive.getTime() - 86_400_000);
      const startLabel = formatDateInTimezone(range.startInclusive, timeZone, {
        month: "long",
        day: "numeric",
      });
      const endLabel = formatDateInTimezone(end, timeZone, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return `${startLabel}–${endLabel}`;
    }
    case "day":
      return formatDateInTimezone(anchor, timeZone, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "agenda": {
      const range = getAgendaRange(anchorDate, timeZone);
      const end = new Date(range.endExclusive.getTime() - 86_400_000);
      const startLabel = formatDateInTimezone(range.startInclusive, timeZone, {
        month: "long",
        day: "numeric",
      });
      const endLabel = formatDateInTimezone(end, timeZone, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return `${startLabel}–${endLabel}`;
    }
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}

export function formatEventTimeLabel(
  event: ScheduleEvent,
  timeZone: string,
  compact = false,
): string {
  if (event.allDay) return "All day";
  if (event.kind === "task" && event.status === "Due") {
    return formatDateInTimezone(event.startAt, timeZone, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  const start = formatDateInTimezone(event.startAt, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (!event.endAt || compact) return start;
  const end = formatDateInTimezone(event.endAt, timeZone, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${start}–${end}`;
}

export function buildAccessibleEventLabel(
  event: ScheduleEvent,
  hasConflict: boolean,
  timeZone: string,
): string {
  const parts = [
    formatEventTimeLabel(event, timeZone),
    event.title,
    getScheduleKindLabel(event.kind),
  ];
  const status = getScheduleStatusLabel(event);
  if (status) parts.push(status);
  if (event.assigneeLabel) parts.push(event.assigneeLabel);
  if (hasConflict) parts.push("Conflict");
  if (isTentativeOrPending(event)) parts.push("Not confirmed");
  return parts.filter(Boolean).join(", ");
}

export function resolveFullCalendarDisplayMode(viewType: string, allDay: boolean): ScheduleEventDisplayMode {
  if (allDay) return "allDay";
  if (viewType === "dayGridMonth") return "month";
  if (viewType === "timeGridWeek") return "week";
  if (viewType === "timeGridDay") return "day";
  if (viewType === "list" || viewType === "listDay" || viewType === "listWeek") return "agenda";
  return "week";
}
