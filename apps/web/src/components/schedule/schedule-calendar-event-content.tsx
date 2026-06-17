"use client";

import type { EventContentArg } from "@fullcalendar/core";
import { AlertTriangle, Clock } from "lucide-react";
import type { ScheduleFullCalendarExtendedProps } from "./schedule-fullcalendar-adapter";
import {
  formatEventTimeLabel,
  getScheduleKindLabel,
  getScheduleStatusLabel,
  isTentativeOrPending,
  resolveFullCalendarDisplayMode,
} from "./schedule-presentation";

function ConflictBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded border border-warning/50 bg-warning/10 px-1 py-px text-[10px] font-medium text-warning"
      title="Schedule conflict"
    >
      <AlertTriangle className="size-2.5" aria-hidden />
      {!compact ? <span>Conflict</span> : null}
    </span>
  );
}

function StatusChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded border border-border bg-foreground/[0.04] px-1 py-px text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
      {label}
    </span>
  );
}

export function ScheduleCalendarEventContent({
  arg,
  timeZone,
}: {
  arg: EventContentArg;
  timeZone: string;
}) {
  const props = arg.event.extendedProps as ScheduleFullCalendarExtendedProps;
  const event = props.scheduleEvent;
  const displayMode = resolveFullCalendarDisplayMode(arg.view.type, arg.event.allDay);
  const timeLabel = formatEventTimeLabel(event, timeZone, displayMode === "month");
  const statusLabel = getScheduleStatusLabel(event);
  const tentative = isTentativeOrPending(event);
  const kindLabel = getScheduleKindLabel(event.kind);

  if (displayMode === "agenda") {
    return (
      <div
        className="flex min-w-0 flex-col gap-1 py-0.5"
        aria-label={props.accessibleLabel}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs font-medium tabular-nums text-foreground-muted">
            {timeLabel}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {event.title}
          </span>
          {props.hasConflict ? <ConflictBadge /> : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-0">
          <StatusChip label={kindLabel} />
          {statusLabel && tentative ? <StatusChip label={statusLabel} /> : null}
          {event.assigneeLabel ? (
            <span className="truncate text-xs text-foreground-muted">{event.assigneeLabel}</span>
          ) : null}
          {event.subtitle ? (
            <span className="truncate text-xs text-foreground-subtle">{event.subtitle}</span>
          ) : null}
        </div>
      </div>
    );
  }

  if (displayMode === "month") {
    return (
      <div
        className="flex min-w-0 items-center gap-1 px-0.5 py-px leading-tight"
        aria-label={props.accessibleLabel}
      >
        {!event.allDay && event.kind !== "task" ? (
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-foreground-muted">
            {timeLabel}
          </span>
        ) : null}
        {event.kind === "task" ? (
          <Clock className="size-2.5 shrink-0 text-foreground-subtle" aria-hidden />
        ) : null}
        <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
          {event.title}
        </span>
        {props.hasConflict ? <ConflictBadge compact /> : null}
        {tentative && !props.hasConflict ? <StatusChip label="?" /> : null}
      </div>
    );
  }

  return (
    <div
      className="flex min-w-0 flex-col gap-0.5 overflow-hidden px-1 py-0.5"
      aria-label={props.accessibleLabel}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span className="shrink-0 text-[10px] font-medium tabular-nums text-foreground-muted">
          {timeLabel}
        </span>
        {props.hasConflict ? <ConflictBadge compact /> : null}
      </div>
      <span className="min-w-0 truncate text-xs font-semibold leading-snug text-foreground">
        {event.title}
      </span>
      {(displayMode === "week" || displayMode === "day") && (
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {tentative && statusLabel ? <StatusChip label={statusLabel} /> : null}
          {event.assigneeLabel ? (
            <span className="truncate text-[10px] text-foreground-muted">{event.assigneeLabel}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
