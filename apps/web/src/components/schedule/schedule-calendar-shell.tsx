"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import type { EventClickArg, EventContentArg } from "@fullcalendar/core";
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Plus } from "lucide-react";
import type { ScheduleConflict, ScheduleEvent } from "@/lib/schedule-query";
import {
  buildSchedulePath,
  shiftScheduleAnchorDate,
  todayDateOnlyInTimezone,
  type ScheduleUrlView,
} from "@/lib/scheduling/schedule-url-state";
import { parseDateOnlyAnchor } from "@/lib/scheduling/deadline-timezone";
import { scheduleEventsToFullCalendarInputs } from "./schedule-fullcalendar-adapter";
import {
  buildScheduleFullCalendarViewConfig,
  SCHEDULE_FULLCALENDAR_BASE_OPTIONS,
  VIEW_TO_FC,
} from "./schedule-fullcalendar-config";
import { buildConflictEventIdSet, formatSchedulePeriodTitle } from "./schedule-presentation";
import { ScheduleCalendarEventContent } from "./schedule-calendar-event-content";
import { ScheduleConflictSummary } from "./schedule-conflict-summary";
import { Button } from "@/components/ui/button";
import { workspaceFormControlClass } from "@/components/line-item-templates/line-item-template-form-fields";

const VIEW_TABS: ScheduleUrlView[] = ["month", "week", "day", "agenda"];

function resolveClientDefaultView(): ScheduleUrlView {
  if (typeof window === "undefined") return "week";
  return window.matchMedia("(max-width: 767px)").matches ? "agenda" : "week";
}

const CALENDAR_SURFACE_CLASS = [
  "schedule-calendar min-h-0 flex-1",
  "[&_.fc]:text-foreground",
  "[&_.fc-theme-standard_td]:border-border",
  "[&_.fc-theme-standard_th]:border-border",
  "[&_.fc-col-header-cell]:bg-background [&_.fc-col-header-cell-cushion]:py-2 [&_.fc-col-header-cell-cushion]:text-xs [&_.fc-col-header-cell-cushion]:font-semibold",
  "[&_.fc-daygrid-day]:bg-surface",
  "[&_.fc-day-other]:bg-foreground/[0.02]",
  "[&_.fc-day-other_.fc-daygrid-day-number]:text-foreground-subtle",
  "[&_.fc-day-today]:bg-accent/5",
  "[&_.fc-day-today_.fc-daygrid-day-number]:font-bold [&_.fc-day-today_.fc-daygrid-day-number]:text-accent",
  "[&_.fc-daygrid-day-number]:text-xs [&_.fc-daygrid-day-number]:p-1.5",
  "[&_.fc-daygrid-event]:mx-0.5 [&_.fc-daygrid-event]:rounded [&_.fc-daygrid-event]:border",
  "[&_.fc-timegrid-event]:rounded [&_.fc-timegrid-event]:border",
  "[&_.fc-list-event]:cursor-pointer",
  "[&_.fc-list-day-cushion]:bg-background [&_.fc-list-day-cushion]:py-2 [&_.fc-list-day-cushion]:text-sm [&_.fc-list-day-cushion]:font-semibold",
  "[&_.fc-event-job]:border-accent/60 [&_.fc-event-job]:bg-accent/15",
  "[&_.fc-event-tentative]:border-dashed [&_.fc-event-tentative]:bg-accent/8",
  "[&_.fc-event-lead-visit]:border-accent/40 [&_.fc-event-lead-visit]:bg-surface",
  "[&_.fc-event-pending-request]:border-dashed",
  "[&_.fc-event-task]:border-border [&_.fc-event-task]:bg-foreground/[0.04]",
  "[&_.fc-event-deadline]:border-dotted",
  "[&_.fc-event-block-business-hours]:border-transparent [&_.fc-event-block-business-hours]:bg-foreground/[0.03] [&_.fc-event-block-business-hours]:opacity-70",
  "[&_.fc-event-block-time-off]:border-warning/30 [&_.fc-event-block-time-off]:bg-warning/10",
  "[&_.fc-event-block-internal]:border-border [&_.fc-event-block-internal]:bg-foreground/[0.04]",
  "[&_.fc-event-conflict]:ring-1 [&_.fc-event-conflict]:ring-warning/50",
  "[&_.fc-more-link]:text-xs [&_.fc-more-link]:font-medium [&_.fc-more-link]:text-accent",
  "[&_.fc-now-indicator-line]:border-accent",
  "[&_.fc-now-indicator-arrow]:border-accent",
].join(" ");

export function ScheduleCalendarShell({
  events,
  conflicts,
  anchorDate,
  view,
  timeZone,
  onEventClick,
  hasActiveFilters,
  onClearFilters,
  filterRow,
  blockForm,
  unscheduledCount,
  trayOpen,
  onTrayToggle,
  trayPanel,
  children,
}: {
  events: ScheduleEvent[];
  conflicts: ScheduleConflict[];
  anchorDate: string;
  view: ScheduleUrlView | null;
  timeZone: string;
  onEventClick: (event: ScheduleEvent) => void;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  filterRow?: ReactNode;
  blockForm?: ReactNode;
  unscheduledCount: number;
  trayOpen: boolean;
  onTrayToggle: () => void;
  trayPanel?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const bootstrappedRef = useRef(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const resolvedView: ScheduleUrlView = view ?? "week";

  const conflictEventIds = useMemo(() => buildConflictEventIdSet(conflicts), [conflicts]);
  const calendarEvents = useMemo(
    () => scheduleEventsToFullCalendarInputs(events, conflictEventIds, timeZone),
    [events, conflictEventIds, timeZone],
  );
  const periodTitle = useMemo(
    () => formatSchedulePeriodTitle(resolvedView, anchorDate, timeZone),
    [resolvedView, anchorDate, timeZone],
  );
  const viewConfig = useMemo(() => buildScheduleFullCalendarViewConfig(), []);

  useEffect(() => {
    if (view !== null || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    const defaultView = resolveClientDefaultView();
    if (defaultView !== "week") {
      router.replace(buildSchedulePath(defaultView, anchorDate));
    }
  }, [view, anchorDate, router]);

  const navigate = useCallback(
    (nextView: ScheduleUrlView, nextDate: string) => {
      router.push(buildSchedulePath(nextView, nextDate));
    },
    [router],
  );

  const initialDate = useMemo(() => parseDateOnlyAnchor(anchorDate, timeZone), [anchorDate, timeZone]);

  const renderEventContent = useCallback(
    (arg: EventContentArg) => <ScheduleCalendarEventContent arg={arg} timeZone={timeZone} />,
    [timeZone],
  );

  const showEmptyFiltered = events.length === 0 && hasActiveFilters;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Primary toolbar */}
      <div className="border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              aria-label="Previous period"
              onClick={() =>
                navigate(resolvedView, shiftScheduleAnchorDate(anchorDate, resolvedView, -1))
              }
            >
              <ChevronLeft className="size-3.5" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(resolvedView, todayDateOnlyInTimezone(timeZone))}
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Next period"
              onClick={() =>
                navigate(resolvedView, shiftScheduleAnchorDate(anchorDate, resolvedView, 1))
              }
            >
              <ChevronRight className="size-3.5" aria-hidden />
            </Button>
            <button
              type="button"
              className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 text-left hover:bg-foreground/[0.04]"
              onClick={() => dateInputRef.current?.showPicker?.() ?? dateInputRef.current?.click()}
              aria-label={`Current period: ${periodTitle}. Open date picker.`}
            >
              <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">
                {periodTitle}
              </h2>
              <CalendarDays className="size-4 shrink-0 text-foreground-subtle group-hover:text-foreground" />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              className="sr-only"
              value={anchorDate}
              aria-hidden
              tabIndex={-1}
              onChange={(e) => navigate(resolvedView, e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div
              className="flex rounded-lg border border-border bg-background p-0.5"
              role="tablist"
              aria-label="Calendar view"
            >
              {VIEW_TABS.map((tab) => (
                <Button
                  key={tab}
                  size="sm"
                  variant={resolvedView === tab ? "primary" : "ghost"}
                  role="tab"
                  aria-selected={resolvedView === tab}
                  className="min-w-[3.25rem] capitalize"
                  onClick={() => navigate(tab, anchorDate)}
                >
                  {tab}
                </Button>
              ))}
            </div>
            {unscheduledCount > 0 ? (
              <Button
                size="sm"
                variant={trayOpen ? "primary" : "secondary"}
                onClick={onTrayToggle}
                aria-pressed={trayOpen}
              >
                Unscheduled {unscheduledCount}
              </Button>
            ) : null}
            {children}
          </div>
        </div>
      </div>

      {/* Compact filter row */}
      <div className="border-b border-border px-3 py-2 sm:px-4">
        <div className="hidden items-center gap-3 md:flex">
          {filterRow}
          {hasActiveFilters && onClearFilters ? (
            <Button size="sm" variant="ghost" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
        <div className="md:hidden">
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-center"
            onClick={() => setShowMobileFilters((v) => !v)}
            aria-expanded={showMobileFilters}
          >
            <Filter className="size-3.5" aria-hidden />
            Filters
            {hasActiveFilters ? (
              <span className="rounded-full bg-accent px-1.5 text-[10px] text-accent-contrast">
                1
              </span>
            ) : null}
          </Button>
          {showMobileFilters ? (
            <div className="mt-2 flex flex-col gap-2">
              {filterRow}
              {hasActiveFilters && onClearFilters ? (
                <Button size="sm" variant="ghost" onClick={onClearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <ScheduleConflictSummary conflicts={conflicts} />
        {blockForm}
      </div>

      {/* Calendar + optional tray */}
      <div
        className={[
          "flex min-h-0 flex-1 flex-col",
          trayOpen && unscheduledCount > 0 ? "lg:flex-row" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="min-h-0 min-w-0 flex-1 p-2 sm:p-3">
          {showEmptyFiltered ? (
            <div className="mb-2 flex items-center justify-center rounded-md border border-dashed border-border py-6 text-sm text-foreground-muted">
              No schedule items match these filters
            </div>
          ) : null}
          <div className={CALENDAR_SURFACE_CLASS}>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
              initialView={VIEW_TO_FC[resolvedView]}
              timeZone={timeZone}
              initialDate={initialDate}
              events={calendarEvents}
              views={viewConfig}
              eventContent={renderEventContent}
              {...SCHEDULE_FULLCALENDAR_BASE_OPTIONS}
              eventClick={(arg: EventClickArg) => {
                const scheduleEvent = arg.event.extendedProps.scheduleEvent as
                  | ScheduleEvent
                  | undefined;
                if (scheduleEvent) onEventClick(scheduleEvent);
              }}
              key={`${resolvedView}-${anchorDate}-${timeZone}`}
            />
          </div>
        </div>
        {trayOpen && unscheduledCount > 0 ? trayPanel : null}
      </div>
    </div>
  );
}

export function ScheduleAddBlockButton({
  showForm,
  onToggle,
}: {
  showForm: boolean;
  onToggle: () => void;
}) {
  return (
    <Button size="sm" variant="secondary" onClick={onToggle}>
      <Plus className="size-3.5" aria-hidden />
      {showForm ? "Cancel" : "Add block"}
    </Button>
  );
}

export function ScheduleAssigneeFilter({
  members,
  value,
  onChange,
}: {
  members: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground-muted">
      <span className="shrink-0">Assignee</span>
      <select
        className={`${workspaceFormControlClass} mt-0 max-w-[12rem] py-1.5 text-xs`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="all">All</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScheduleBlockForm({
  blockTitle,
  blockType,
  blockStart,
  blockEnd,
  isPending,
  onTitleChange,
  onTypeChange,
  onStartChange,
  onEndChange,
  onSave,
}: {
  blockTitle: string;
  blockType: "BUSINESS_HOURS" | "TIME_OFF" | "INTERNAL_EVENT";
  blockStart: string;
  blockEnd: string;
  isPending: boolean;
  onTitleChange: (v: string) => void;
  onTypeChange: (v: "BUSINESS_HOURS" | "TIME_OFF" | "INTERNAL_EVENT") => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
      <input
        className={`${workspaceFormControlClass} mt-0 text-xs`}
        placeholder="Block title"
        value={blockTitle}
        onChange={(e) => onTitleChange(e.target.value)}
      />
      <select
        className={`${workspaceFormControlClass} mt-0 text-xs`}
        value={blockType}
        onChange={(e) => onTypeChange(e.target.value as typeof blockType)}
      >
        <option value="INTERNAL_EVENT">Internal event</option>
        <option value="TIME_OFF">Time off</option>
        <option value="BUSINESS_HOURS">Business hours</option>
      </select>
      <input
        type="datetime-local"
        className={`${workspaceFormControlClass} mt-0 text-xs`}
        value={blockStart}
        onChange={(e) => onStartChange(e.target.value)}
      />
      <input
        type="datetime-local"
        className={`${workspaceFormControlClass} mt-0 text-xs`}
        value={blockEnd}
        onChange={(e) => onEndChange(e.target.value)}
      />
      <div className="sm:col-span-2">
        <Button size="sm" disabled={!blockTitle || !blockStart || isPending} onClick={onSave}>
          {isPending ? "Saving..." : "Save block"}
        </Button>
      </div>
    </div>
  );
}
