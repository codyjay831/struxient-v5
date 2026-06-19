"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  confirmLeadVisitRequestAction,
  getLeadVisitScheduleContextAction,
  rescheduleLeadVisitRequestAction,
  type LeadVisitScheduleContextEvent,
} from "@/app/(workspace)/schedule/schedule-actions";
import type { SchedulerStaffOption } from "@/lib/lead-commercial-surface/loader";
import {
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  type LeadVisitAccessSnapshot,
  type LeadVisitSiteContactSnapshot,
} from "@/lib/scheduling/lead-visit-schemas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

type SchedulerMode = "confirm" | "reschedule";

const SCHEDULE_KIND_LABELS: Record<LeadVisitScheduleContextEvent["kind"], string> = {
  "job-schedule-event": "Job",
  "lead-visit-request": "Visit",
  task: "Task",
  "schedule-block": "Block",
  "payment-overlay": "Payment",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getDefaultVisitDate(initialDate?: Date | null) {
  if (initialDate && !Number.isNaN(initialDate.getTime())) return initialDate;

  const date = new Date();
  date.setHours(date.getHours() + 2, 0, 0, 0);
  return date;
}

function parseLocalDateTime(dateValue: string, timeValue: string) {
  const parsed = new Date(`${dateValue}T${timeValue}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateInputValue(dateValue: string) {
  const parsed = new Date(`${dateValue}T00:00`);
  return Number.isNaN(parsed.getTime()) ? startOfLocalDay(new Date()) : parsed;
}

function formatWeekRange(days: Date[]) {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "This week";

  const firstLabel = first.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const lastLabel = last.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${firstLabel} - ${lastLabel}`;
}

function formatEventTime(event: LeadVisitScheduleContextEvent) {
  if (event.allDay) return "All day";

  const start = new Date(event.startAt);
  const startLabel = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!event.endAt) return startLabel;

  const end = new Date(event.endAt);
  const endLabel = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${startLabel} - ${endLabel}`;
}

function eventTouchesDay(event: LeadVisitScheduleContextEvent, day: Date) {
  const dayStart = startOfLocalDay(day);
  const dayEnd = addDays(dayStart, 1);
  const startAt = new Date(event.startAt);
  if (!event.endAt) return startAt >= dayStart && startAt < dayEnd;

  const endAt = new Date(event.endAt);
  return startAt < dayEnd && endAt > dayStart;
}

export function LeadSiteVisitSchedulerDialog({
  open,
  onOpenChange,
  requestId,
  mode = "confirm",
  initialDate,
  requestedWindow,
  assigneeOptions = [],
  initialAssigneeId,
  initialDurationMinutes,
  initialArrivalWindowLabel,
  initialAccessSnapshot,
  initialSiteContactSnapshot,
  expectedUpdatedAt,
  onScheduled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string | null;
  mode?: SchedulerMode;
  initialDate?: Date | null;
  requestedWindow?: string | null;
  assigneeOptions?: SchedulerStaffOption[];
  initialAssigneeId?: string | null;
  initialDurationMinutes?: number | null;
  initialArrivalWindowLabel?: string | null;
  initialAccessSnapshot?: LeadVisitAccessSnapshot | null;
  initialSiteContactSnapshot?: LeadVisitSiteContactSnapshot | null;
  expectedUpdatedAt?: Date;
  onScheduled?: () => void;
}) {
  const defaultDate = useMemo(() => getDefaultVisitDate(initialDate), [initialDate]);
  const [weekStartValue, setWeekStartValue] = useState(() =>
    toDateInputValue(startOfLocalDay(defaultDate)),
  );
  const [dateValue, setDateValue] = useState(() => toDateInputValue(defaultDate));
  const [timeValue, setTimeValue] = useState(() => toTimeInputValue(defaultDate));
  const [assignedUserId, setAssignedUserId] = useState(initialAssigneeId ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    String(initialDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES),
  );
  const [arrivalWindowLabel, setArrivalWindowLabel] = useState(initialArrivalWindowLabel ?? "");
  const [accessSnapshot, setAccessSnapshot] = useState<LeadVisitAccessSnapshot>({
    someoneMustBeHome: initialAccessSnapshot?.someoneMustBeHome ?? false,
    gateCode: initialAccessSnapshot?.gateCode ?? "",
    garageAccess: initialAccessSnapshot?.garageAccess ?? "",
    lockbox: initialAccessSnapshot?.lockbox ?? "",
    pets: initialAccessSnapshot?.pets ?? "",
    parking: initialAccessSnapshot?.parking ?? "",
    callOnArrival: initialAccessSnapshot?.callOnArrival ?? false,
    accessNotes: initialAccessSnapshot?.accessNotes ?? "",
  });
  const [siteContactSnapshot, setSiteContactSnapshot] = useState<LeadVisitSiteContactSnapshot>({
    name: initialSiteContactSnapshot?.name ?? "",
    phone: initialSiteContactSnapshot?.phone ?? "",
    email: initialSiteContactSnapshot?.email ?? "",
    relationship: initialSiteContactSnapshot?.relationship ?? "",
    notes: initialSiteContactSnapshot?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [scheduleEvents, setScheduleEvents] = useState<LeadVisitScheduleContextEvent[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const weekStartDate = useMemo(() => parseDateInputValue(weekStartValue), [weekStartValue]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index)),
    [weekStartDate],
  );
  const weekRangeLabel = useMemo(() => formatWeekRange(weekDays), [weekDays]);
  const selectedDate = useMemo(() => parseDateInputValue(dateValue), [dateValue]);
  const selectedDayEvents = useMemo(
    () =>
      scheduleEvents
        .filter((event) => eventTouchesDay(event, selectedDate))
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    [scheduleEvents, selectedDate],
  );
  const title = mode === "reschedule" ? "Reschedule site visit" : "Schedule site visit";
  const actionLabel = mode === "reschedule" ? "Reschedule visit" : "Schedule visit";

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const startAt = parseDateInputValue(weekStartValue);
    const endAt = addDays(startAt, 7);

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setIsScheduleLoading(true);
        setScheduleError(null);
        return getLeadVisitScheduleContextAction({ startAt, endAt });
      })
      .then((result) => {
        if (cancelled || !result) return;
        if (!result.success) {
          setScheduleError(result.error);
          setScheduleEvents([]);
          return;
        }
        setScheduleEvents(result.events);
      })
      .catch(() => {
        if (cancelled) return;
        setScheduleError("Failed to load schedule context.");
        setScheduleEvents([]);
      })
      .finally(() => {
        if (!cancelled) setIsScheduleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, weekStartValue]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick a time without leaving this lead. This confirms the pre-job visit request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {requestedWindow?.trim() ? (
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground-muted">
              Customer requested: <span className="font-medium text-foreground">{requestedWindow.trim()}</span>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setWeekStartValue(toDateInputValue(addDays(weekStartDate, -7)));
                setDateValue(toDateInputValue(addDays(selectedDate, -7)));
              }}
              aria-label="Previous week"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                Schedule context
              </p>
              <p className="text-sm font-medium text-foreground">{weekRangeLabel}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setWeekStartValue(toDateInputValue(addDays(weekStartDate, 7)));
                setDateValue(toDateInputValue(addDays(selectedDate, 7)));
              }}
              aria-label="Next week"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((day) => {
              const value = toDateInputValue(day);
              const selected = value === dateValue;
              const busyCount = scheduleEvents.filter((event) => eventTouchesDay(event, day)).length;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDateValue(value)}
                  className={`rounded-lg border px-2 py-2 text-center text-xs transition-colors ${
                    selected
                      ? "border-border-strong bg-accent text-accent-contrast"
                      : "border-border bg-background text-foreground-muted hover:border-border-strong hover:text-foreground"
                  }`}
                >
                  <span className="block text-[0.65rem] uppercase tracking-wide">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="block text-sm font-semibold">{day.getDate()}</span>
                  <span
                    className={`mt-1 block text-[0.65rem] ${
                      selected ? "text-accent-contrast/80" : "text-foreground-subtle"
                    }`}
                  >
                    {isScheduleLoading ? "..." : busyCount > 0 ? `${busyCount} busy` : "Open"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={workspaceFormFieldLabelClass}>Date</span>
              <input
                type="date"
                className={workspaceFormControlClass}
                value={dateValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setDateValue(nextValue);
                  setWeekStartValue(nextValue);
                }}
              />
            </label>
            <label>
              <span className={workspaceFormFieldLabelClass}>Time</span>
              <input
                type="time"
                className={workspaceFormControlClass}
                value={timeValue}
                onChange={(event) => setTimeValue(event.target.value)}
              />
            </label>
            <label>
              <span className={workspaceFormFieldLabelClass}>Assigned estimator</span>
              <select
                className={workspaceFormControlClass}
                value={assignedUserId}
                onChange={(event) => setAssignedUserId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={workspaceFormFieldLabelClass}>Duration (minutes)</span>
              <input
                type="number"
                min={15}
                step={15}
                className={workspaceFormControlClass}
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
              />
            </label>
            <label className="sm:col-span-2">
              <span className={workspaceFormFieldLabelClass}>Arrival window</span>
              <input
                className={workspaceFormControlClass}
                value={arrivalWindowLabel}
                onChange={(event) => setArrivalWindowLabel(event.target.value)}
                placeholder="e.g. 9:00 AM - 11:00 AM"
              />
            </label>
          </div>

          <div className="rounded-lg border border-border bg-background p-3 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
              Access snapshot
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(accessSnapshot.someoneMustBeHome)}
                  onChange={(event) =>
                    setAccessSnapshot((current) => ({
                      ...current,
                      someoneMustBeHome: event.target.checked,
                    }))
                  }
                />
                Someone must be home
              </label>
              <label>
                <span className={workspaceFormFieldLabelClass}>Gate code</span>
                <input
                  className={workspaceFormControlClass}
                  value={accessSnapshot.gateCode ?? ""}
                  onChange={(event) =>
                    setAccessSnapshot((current) => ({ ...current, gateCode: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className={workspaceFormFieldLabelClass}>Lockbox</span>
                <input
                  className={workspaceFormControlClass}
                  value={accessSnapshot.lockbox ?? ""}
                  onChange={(event) =>
                    setAccessSnapshot((current) => ({ ...current, lockbox: event.target.value }))
                  }
                />
              </label>
              <label className="sm:col-span-2">
                <span className={workspaceFormFieldLabelClass}>Access notes</span>
                <textarea
                  className={workspaceFormControlClass}
                  rows={2}
                  value={accessSnapshot.accessNotes ?? ""}
                  onChange={(event) =>
                    setAccessSnapshot((current) => ({
                      ...current,
                      accessNotes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle pt-2">
              Site contact snapshot
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={workspaceFormFieldLabelClass}>Name</span>
                <input
                  className={workspaceFormControlClass}
                  value={siteContactSnapshot.name ?? ""}
                  onChange={(event) =>
                    setSiteContactSnapshot((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span className={workspaceFormFieldLabelClass}>Phone</span>
                <input
                  className={workspaceFormControlClass}
                  value={siteContactSnapshot.phone ?? ""}
                  onChange={(event) =>
                    setSiteContactSnapshot((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                Selected day schedule
              </p>
              {isScheduleLoading ? (
                <span className="text-xs text-foreground-subtle">Loading...</span>
              ) : null}
            </div>
            {scheduleError ? (
              <p className="mt-2 text-xs text-danger">{scheduleError}</p>
            ) : selectedDayEvents.length > 0 ? (
              <div className="mt-2 max-h-40 space-y-2 overflow-y-auto pr-1">
                {selectedDayEvents.map((event) => {
                  const isCurrentVisit = requestId ? event.recordId === requestId : false;
                  return (
                    <div
                      key={event.id}
                      className="rounded-md border border-border bg-surface-elevated px-2.5 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-xs font-medium tabular-nums text-foreground-muted">
                          {formatEventTime(event)}
                        </span>
                        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {event.title}
                        </span>
                      </div>
                      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-foreground-muted">
                        <span>{SCHEDULE_KIND_LABELS[event.kind]}</span>
                        {event.status ? <span>{event.status.replaceAll("_", " ")}</span> : null}
                        {event.assigneeLabel ? <span>{event.assigneeLabel}</span> : null}
                        {isCurrentVisit ? <span>This visit</span> : null}
                        {event.subtitle ? (
                          <span className="min-w-0 truncate text-foreground-subtle">
                            {event.subtitle}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs text-foreground-muted">
                No visits, job commitments, task deadlines, or blocks are scheduled on this day.
              </p>
            )}
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={isPending || !requestId}
            onClick={() => {
              setError(null);
              const scheduledStartAt = parseLocalDateTime(dateValue, timeValue);
              if (!scheduledStartAt) {
                setError("Choose a valid visit date and time.");
                return;
              }
              if (!requestId) {
                setError("Missing visit request.");
                return;
              }

              startTransition(async () => {
                const parsedDuration = Number.parseInt(durationMinutes, 10);
                const scheduleDetails = {
                  scheduledStartAt,
                  estimatedDurationMinutes: Number.isFinite(parsedDuration)
                    ? parsedDuration
                    : DEFAULT_ESTIMATED_DURATION_MINUTES,
                  assignedUserId: assignedUserId || null,
                  arrivalWindowLabel: arrivalWindowLabel.trim() || null,
                  accessSnapshot,
                  siteContactSnapshot,
                  notes: requestedWindow ?? undefined,
                };
                const actionOptions = {
                  sourceSurface: "lead" as const,
                  expectedUpdatedAt,
                };
                const result =
                  mode === "reschedule"
                    ? await rescheduleLeadVisitRequestAction(
                        requestId,
                        scheduleDetails,
                        actionOptions,
                      )
                    : await confirmLeadVisitRequestAction(
                        requestId,
                        scheduleDetails,
                        actionOptions,
                      );

                if (result.error) {
                  setError(result.error);
                  return;
                }

                onOpenChange(false);
                onScheduled?.();
              });
            }}
          >
            {isPending ? "Saving..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
