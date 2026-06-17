"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  JobScheduleEventCompletionOutcome,
  LeadVisitRequestStatus,
} from "@prisma/client";
import { X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ScheduleConflict, ScheduleEvent } from "@/lib/schedule-query";
import {
  cancelJobScheduleEventFromScheduleAction,
  completeJobScheduleEventFromScheduleAction,
  rescheduleJobScheduleEventFromScheduleAction,
  cancelLeadVisitRequestAction,
  confirmLeadVisitRequestAction,
  rescheduleLeadVisitRequestAction,
  updateTaskScheduleFromCalendarAction,
  upsertScheduleBlockAction,
} from "@/app/(workspace)/schedule/schedule-actions";
import {
  buildDueOnlyTaskTimingUpdate,
  buildScheduledBlockTaskTimingUpdate,
} from "@/lib/schedule-task-update";
import {
  formatDatetimeLocalInTimezone,
  parseDatetimeLocalInTimezone,
} from "@/lib/scheduling/deadline-timezone";
import { getScheduleKindLabel, getScheduleStatusLabel } from "./schedule-presentation";

type MemberOption = { id: string; label: string };

function toDateTimeLocalValue(value: Date | null | undefined, timeZone: string): string {
  if (!value) return "";
  return formatDatetimeLocalInTimezone(value, timeZone);
}

export function ScheduleEventDetailsDrawer({
  event,
  members,
  timeZone,
  conflicts = [],
  open,
  onClose,
}: {
  event: ScheduleEvent | null;
  members: MemberOption[];
  timeZone: string;
  conflicts?: ScheduleConflict[];
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && event) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, event]);

  if (!event) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-y-0 right-0 z-50 h-full w-full max-w-md border-l border-border bg-surface p-0 text-foreground shadow-2xl outline-none animate-in slide-in-from-right duration-300 [&::backdrop]:bg-foreground/20"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <ScheduleEventDetailsForm
        key={event.id}
        event={event}
        members={members}
        timeZone={timeZone}
        conflicts={conflicts}
        onClose={onClose}
      />
    </dialog>
  );
}

function ScheduleEventDetailsForm({
  event,
  members,
  timeZone,
  conflicts,
  onClose,
}: {
  event: ScheduleEvent;
  members: MemberOption[];
  timeZone: string;
  conflicts: ScheduleConflict[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [newDateTime, setNewDateTime] = useState(() => toDateTimeLocalValue(event.startAt, timeZone));
  const [newEventEndDateTime, setNewEventEndDateTime] = useState(() =>
    toDateTimeLocalValue(
      event.endAt ?? new Date(event.startAt.getTime() + 2 * 60 * 60 * 1000),
      timeZone,
    ),
  );
  const [eventReason, setEventReason] = useState("");
  const [dueDate, setDueDate] = useState(() =>
    event.kind === "task" && event.status === "Due" ? toDateTimeLocalValue(event.startAt, timeZone) : "",
  );
  const [scheduledStartAt, setScheduledStartAt] = useState(() =>
    event.kind === "task" && event.status === "Scheduled"
      ? toDateTimeLocalValue(event.startAt, timeZone)
      : "",
  );
  const [scheduledEndAt, setScheduledEndAt] = useState(() =>
    event.kind === "task" && event.status === "Scheduled"
      ? toDateTimeLocalValue(event.endAt, timeZone)
      : "",
  );
  const [assigneeId, setAssigneeId] = useState(event.assigneeUserId ?? "");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [completionOutcome, setCompletionOutcome] = useState<JobScheduleEventCompletionOutcome>(
    JobScheduleEventCompletionOutcome.WORK_COMPLETED,
  );
  const [blockTitle, setBlockTitle] = useState(event.title);
  const [blockType, setBlockType] = useState<"BUSINESS_HOURS" | "TIME_OFF" | "INTERNAL_EVENT">(
    (event.status as "BUSINESS_HOURS" | "TIME_OFF" | "INTERNAL_EVENT") ?? "INTERNAL_EVENT",
  );

  function parseLocal(value: string): Date {
    return parseDatetimeLocalInTimezone(value, timeZone);
  }

  return (
    <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0 pr-4">
            <p className="text-base font-semibold text-foreground">{event.title}</p>
            <p className="mt-1 text-xs text-foreground-muted">
              {format(event.startAt, "EEE, MMM d · p")}
              {event.endAt ? ` – ${format(event.endAt, "p")}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge label={getScheduleKindLabel(event.kind)} tone="neutral" />
              {event.status ? (
                <StatusBadge label={getScheduleStatusLabel(event) ?? event.status} tone="sent" />
              ) : null}
              {conflicts.length > 0 ? (
                <StatusBadge label="Conflict" tone="warning" />
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-2 text-foreground-subtle hover:text-foreground"
            aria-label="Close details"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {event.subtitle ? (
            <p className="text-sm text-foreground-muted">{event.subtitle}</p>
          ) : null}
          {event.assigneeLabel ? (
            <p className="text-xs text-foreground-muted">Assignee: {event.assigneeLabel}</p>
          ) : null}
          {conflicts.length > 0 ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              {conflicts.map((conflict) => (
                <p key={`${conflict.userId}-${conflict.eventIds.join("-")}`} className="text-xs text-warning">
                  {conflict.userLabel}: {conflict.reason}
                </p>
              ))}
            </div>
          ) : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}

          {event.kind === "job-schedule-event" ? (
            <div className="space-y-3">
              <input
                type="datetime-local"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
              />
              <input
                type="datetime-local"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={newEventEndDateTime}
                onChange={(e) => setNewEventEndDateTime(e.target.value)}
              />
              <input
                type="text"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                placeholder="Reason (required for confirmed cancel)"
                value={eventReason}
                onChange={(e) => setEventReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await rescheduleJobScheduleEventFromScheduleAction(
                        event.recordId,
                        {
                          startAt: parseLocal(newDateTime),
                          endAt: parseLocal(newEventEndDateTime),
                          reason: eventReason.trim() || undefined,
                        },
                      );
                      if (result.error) setError(result.error);
                      else onClose();
                    })
                  }
                >
                  Reschedule event
                </Button>
                {event.status === "TENTATIVE" || event.status === "CONFIRMED" ? (
                  <Button
                    size="sm"
                    variant="muted"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await cancelJobScheduleEventFromScheduleAction(
                          event.recordId,
                          eventReason.trim() || "Canceled from schedule board.",
                        );
                        if (result.error) setError(result.error);
                        else onClose();
                      })
                    }
                  >
                    Cancel event
                  </Button>
                ) : null}
              </div>
              {event.status === "CONFIRMED" ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <select
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                    value={completionOutcome}
                    onChange={(e) =>
                      setCompletionOutcome(e.target.value as JobScheduleEventCompletionOutcome)
                    }
                  >
                    <option value={JobScheduleEventCompletionOutcome.WORK_COMPLETED}>
                      Work completed
                    </option>
                    <option value={JobScheduleEventCompletionOutcome.PARTIAL_WORK}>
                      Partial work
                    </option>
                    <option value={JobScheduleEventCompletionOutcome.NO_WORK_COMPLETED}>
                      No work completed
                    </option>
                  </select>
                  <Button
                    size="sm"
                    variant="muted"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await completeJobScheduleEventFromScheduleAction(
                          event.recordId,
                          completionOutcome,
                          eventReason.trim() || undefined,
                        );
                        if (result.error) setError(result.error);
                        else onClose();
                      })
                    }
                  >
                    Complete event
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {event.kind === "lead-visit-request" ? (
            <div className="space-y-3">
              <input
                type="datetime-local"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs text-foreground-muted">
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                />
                Notify customer
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const date = parseLocal(newDateTime);
                      const result =
                        event.status === LeadVisitRequestStatus.PENDING
                          ? await confirmLeadVisitRequestAction(
                              event.recordId,
                              date,
                              notifyCustomer,
                            )
                          : await rescheduleLeadVisitRequestAction(
                              event.recordId,
                              date,
                              notifyCustomer,
                            );
                      if (result.error) setError(result.error);
                      else onClose();
                    })
                  }
                >
                  {event.status === LeadVisitRequestStatus.PENDING ? "Confirm" : "Reschedule"}
                </Button>
                <Button
                  size="sm"
                  variant="muted"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await cancelLeadVisitRequestAction(event.recordId);
                      if (result.error) setError(result.error);
                      else onClose();
                    })
                  }
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {event.kind === "task" ? (
            <div className="space-y-3">
              <label className="text-[11px] text-foreground-muted">Due date</label>
              <input
                type="datetime-local"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await updateTaskScheduleFromCalendarAction(
                      buildDueOnlyTaskTimingUpdate(
                        event.recordId,
                        dueDate ? parseLocal(dueDate) : null,
                        assigneeId || null,
                      ),
                    );
                    if (result.error) setError(result.error);
                    else onClose();
                  })
                }
              >
                Save due date
              </Button>
              <div className="border-t border-border pt-3">
                <label className="text-[11px] text-foreground-muted">Scheduled block</label>
                <div className="mt-2 space-y-2">
                  <input
                    type="datetime-local"
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                    value={scheduledStartAt}
                    onChange={(e) => setScheduledStartAt(e.target.value)}
                  />
                  <input
                    type="datetime-local"
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                    value={scheduledEndAt}
                    onChange={(e) => setScheduledEndAt(e.target.value)}
                  />
                  <select
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await updateTaskScheduleFromCalendarAction(
                            buildScheduledBlockTaskTimingUpdate(
                              event.recordId,
                              scheduledStartAt ? parseLocal(scheduledStartAt) : null,
                              scheduledEndAt ? parseLocal(scheduledEndAt) : null,
                              assigneeId || null,
                            ),
                          );
                          if (result.error) setError(result.error);
                          else onClose();
                        })
                      }
                    >
                      Save schedule block
                    </Button>
                    <Button
                      size="sm"
                      variant="muted"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await updateTaskScheduleFromCalendarAction(
                            buildScheduledBlockTaskTimingUpdate(
                              event.recordId,
                              null,
                              null,
                              assigneeId || null,
                            ),
                          );
                          if (result.error) setError(result.error);
                          else {
                            setScheduledStartAt("");
                            setScheduledEndAt("");
                            onClose();
                          }
                        })
                      }
                    >
                      Clear scheduled block
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {event.kind === "schedule-block" ? (
            <div className="space-y-3">
              <input
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={blockTitle}
                onChange={(e) => setBlockTitle(e.target.value)}
              />
              <select
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={blockType}
                onChange={(e) => setBlockType(e.target.value as typeof blockType)}
              >
                <option value="INTERNAL_EVENT">Internal event</option>
                <option value="TIME_OFF">Time off</option>
                <option value="BUSINESS_HOURS">Business hours</option>
              </select>
              <input
                type="datetime-local"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={newDateTime}
                onChange={(e) => setNewDateTime(e.target.value)}
              />
              <input
                type="datetime-local"
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
                value={newEventEndDateTime}
                onChange={(e) => setNewEventEndDateTime(e.target.value)}
              />
              <Button
                size="sm"
                disabled={isPending || !blockTitle}
                onClick={() =>
                  startTransition(async () => {
                    const result = await upsertScheduleBlockAction({
                      blockId: event.recordId,
                      title: blockTitle,
                      type: blockType,
                      startAt: parseLocal(newDateTime),
                      endAt: newEventEndDateTime ? parseLocal(newEventEndDateTime) : undefined,
                    });
                    if (result.error) setError(result.error);
                    else onClose();
                  })
                }
              >
                Save block
              </Button>
            </div>
          ) : null}
        </div>

        {event.recordHref ? (
          <div className="border-t border-border px-5 py-4">
            <a
              href={event.recordHref}
              className="text-sm font-medium text-accent underline underline-offset-4"
            >
              Open record
            </a>
          </div>
        ) : null}
    </div>
  );
}
