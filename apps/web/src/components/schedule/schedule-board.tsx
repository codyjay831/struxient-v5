"use client";

import { useMemo, useState, useTransition } from "react";
import { format } from "date-fns";
import { JobScheduleEventCompletionOutcome, LeadVisitRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  ScheduleConflict,
  ScheduleEvent,
  ScheduleView,
  UnscheduledScheduleItem,
} from "@/lib/schedule-query";
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

type MemberOption = { id: string; label: string };

function toDateTimeLocalValue(value: Date | null | undefined): string {
  if (!value) return "";
  return format(value, "yyyy-MM-dd'T'HH:mm");
}

export function ScheduleBoard({
  events,
  unscheduled,
  conflicts,
  members,
  view,
}: {
  events: ScheduleEvent[];
  unscheduled: UnscheduledScheduleItem[];
  conflicts: ScheduleConflict[];
  members: MemberOption[];
  view: ScheduleView;
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedMemberId, setSelectedMemberId] = useState<string>("all");
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockTitle, setBlockTitle] = useState("");
  const [blockType, setBlockType] = useState<"BUSINESS_HOURS" | "TIME_OFF" | "INTERNAL_EVENT">(
    "INTERNAL_EVENT",
  );
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (selectedMemberId === "all") return true;
        return event.assigneeUserId === selectedMemberId;
      }),
    [events, selectedMemberId],
  );

  const groupedByDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const event of filteredEvents) {
      const key = format(event.startAt, "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredEvents]);

  return (
    <div className="space-y-6">
      <WorkspacePanel padding="compact">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge label={`View: ${view}`} tone="neutral" />
          <label className="text-xs font-medium text-foreground-muted">
            Assignee
            <select
              className="ml-2 rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
            >
              <option value="all">All</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowBlockForm((v) => !v)}
          >
            {showBlockForm ? "Cancel block" : "Add schedule block"}
          </Button>
        </div>
        {showBlockForm ? (
          <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <input
              className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
              placeholder="Block title"
              value={blockTitle}
              onChange={(e) => setBlockTitle(e.target.value)}
            />
            <select
              className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
              value={blockType}
              onChange={(e) => setBlockType(e.target.value as typeof blockType)}
            >
              <option value="INTERNAL_EVENT">Internal event</option>
              <option value="TIME_OFF">Time off</option>
              <option value="BUSINESS_HOURS">Business hours</option>
            </select>
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
              value={blockStart}
              onChange={(e) => setBlockStart(e.target.value)}
            />
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
              value={blockEnd}
              onChange={(e) => setBlockEnd(e.target.value)}
            />
            <div className="sm:col-span-2">
              <Button
                size="sm"
                disabled={!blockTitle || !blockStart || isPending}
                onClick={() =>
                  startTransition(async () => {
                    await upsertScheduleBlockAction({
                      title: blockTitle,
                      type: blockType,
                      startAt: new Date(blockStart),
                      endAt: blockEnd ? new Date(blockEnd) : undefined,
                    });
                    setBlockTitle("");
                    setBlockStart("");
                    setBlockEnd("");
                    setShowBlockForm(false);
                  })
                }
              >
                {isPending ? "Saving..." : "Save block"}
              </Button>
            </div>
          </div>
        ) : null}
      </WorkspacePanel>

      {conflicts.length > 0 ? (
        <WorkspacePanel padding="compact" className="border-warning/30 bg-warning/5">
          <h3 className="text-sm font-semibold text-warning">Schedule conflicts</h3>
          <div className="mt-2 space-y-1">
            {conflicts.map((conflict) => (
              <p key={`${conflict.userId}-${conflict.eventIds.join("-")}`} className="text-xs text-warning">
                {conflict.userLabel}: {conflict.reason}
              </p>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <WorkspacePanel padding="compact">
          <h3 className="text-sm font-semibold text-foreground">Calendar events</h3>
          <p className="mt-1 text-xs text-foreground-muted">
            Job visits are hard field appointments. Task timing controls deadlines and scheduled work blocks per task.
          </p>
          <div className="mt-4 space-y-4">
            {groupedByDate.length === 0 ? (
              <p className="text-sm text-foreground-muted">No events in this range.</p>
            ) : (
              groupedByDate.map(([day, dayEvents]) => (
                <div key={day} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    {format(new Date(day), "EEE, MMM d")}
                  </p>
                  {dayEvents.map((event) => (
                    <EventRow key={event.id} event={event} members={members} />
                  ))}
                </div>
              ))
            )}
          </div>
        </WorkspacePanel>

        <WorkspacePanel padding="compact">
          <h3 className="text-sm font-semibold text-foreground">Unscheduled tray</h3>
          <div className="mt-3 space-y-3">
            {unscheduled.length === 0 ? (
              <p className="text-sm text-foreground-muted">Nothing unscheduled right now.</p>
            ) : (
              unscheduled.map((item) => (
                <div key={item.id} className="rounded border border-border bg-surface p-3">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  {item.subtitle ? (
                    <p className="text-xs text-foreground-muted">{item.subtitle}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-foreground-muted">{item.reason}</p>
                  {item.recordHref ? (
                    <a
                      className="mt-2 inline-flex text-xs font-medium text-accent underline underline-offset-4"
                      href={item.recordHref}
                    >
                      {item.actionLabel}
                    </a>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}

function EventRow({ event, members }: { event: ScheduleEvent; members: MemberOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [newDateTime, setNewDateTime] = useState(
    format(event.startAt, "yyyy-MM-dd'T'HH:mm"),
  );
  const [newEventEndDateTime, setNewEventEndDateTime] = useState(
    toDateTimeLocalValue(
      event.endAt ??
        new Date(event.startAt.getTime() + 2 * 60 * 60 * 1000),
    ),
  );
  const [eventReason, setEventReason] = useState("");
  const [dueDate, setDueDate] = useState(
    event.kind === "task" && event.status === "Due" ? toDateTimeLocalValue(event.startAt) : "",
  );
  const [scheduledStartAt, setScheduledStartAt] = useState(
    event.kind === "task" && event.status === "Scheduled" ? toDateTimeLocalValue(event.startAt) : "",
  );
  const [scheduledEndAt, setScheduledEndAt] = useState(
    event.kind === "task" && event.status === "Scheduled" ? toDateTimeLocalValue(event.endAt) : "",
  );
  const [assigneeId, setAssigneeId] = useState(event.assigneeUserId ?? "");
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [completionOutcome, setCompletionOutcome] = useState<JobScheduleEventCompletionOutcome>(
    JobScheduleEventCompletionOutcome.WORK_COMPLETED,
  );

  return (
    <div className="rounded border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-foreground">{event.title}</p>
        <StatusBadge label={event.kind} tone="neutral" />
        {event.status ? <StatusBadge label={event.status} tone="sent" /> : null}
      </div>
      <p className="text-xs text-foreground-muted">
        {format(event.startAt, "p")} {event.endAt ? `- ${format(event.endAt, "p")}` : ""}
        {event.assigneeLabel ? ` · ${event.assigneeLabel}` : ""}
      </p>
      {event.subtitle ? <p className="mt-1 text-xs text-foreground-muted">{event.subtitle}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {event.kind === "job-schedule-event" ? (
          <>
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={newDateTime}
              onChange={(e) => setNewDateTime(e.target.value)}
            />
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={newEventEndDateTime}
              onChange={(e) => setNewEventEndDateTime(e.target.value)}
            />
            <input
              type="text"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              placeholder="Reason (required for confirmed cancel)"
              value={eventReason}
              onChange={(e) => setEventReason(e.target.value)}
            />
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await rescheduleJobScheduleEventFromScheduleAction(event.recordId, {
                    startAt: new Date(newDateTime),
                    endAt: new Date(newEventEndDateTime),
                    reason: eventReason.trim() || undefined,
                  });
                })
              }
            >
              {isPending ? "Saving..." : "Reschedule event"}
            </Button>
            {event.status === "TENTATIVE" || event.status === "CONFIRMED" ? (
              <Button
                size="sm"
                variant="muted"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await cancelJobScheduleEventFromScheduleAction(
                      event.recordId,
                      eventReason.trim() || "Canceled from schedule board.",
                    );
                  })
                }
              >
                Cancel event
              </Button>
            ) : null}
            {event.status === "CONFIRMED" ? (
              <Button
                size="sm"
                variant="muted"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await completeJobScheduleEventFromScheduleAction(
                      event.recordId,
                      completionOutcome,
                      eventReason.trim() || undefined,
                    );
                  })
                }
              >
                Complete event
              </Button>
            ) : null}
            {event.status === "CONFIRMED" ? (
              <select
                className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
                value={completionOutcome}
                onChange={(e) =>
                  setCompletionOutcome(
                    e.target.value as JobScheduleEventCompletionOutcome,
                  )
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
            ) : null}
          </>
        ) : null}

        {event.kind === "lead-visit-request" ? (
          <>
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={newDateTime}
              onChange={(e) => setNewDateTime(e.target.value)}
            />
            <label className="text-xs text-foreground-muted">
              <input
                type="checkbox"
                className="mr-1"
                checked={notifyCustomer}
                onChange={(e) => setNotifyCustomer(e.target.checked)}
              />
              Notify customer
            </label>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  if (event.status === LeadVisitRequestStatus.PENDING) {
                    await confirmLeadVisitRequestAction(event.recordId, new Date(newDateTime), notifyCustomer);
                  } else {
                    await rescheduleLeadVisitRequestAction(event.recordId, new Date(newDateTime), notifyCustomer);
                  }
                })
              }
            >
              {isPending
                ? "Saving..."
                : event.status === LeadVisitRequestStatus.PENDING
                  ? "Confirm"
                  : "Reschedule"}
            </Button>
            <Button
              size="sm"
              variant="muted"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await cancelLeadVisitRequestAction(event.recordId);
                })
              }
            >
              Cancel
            </Button>
          </>
        ) : null}

        {event.kind === "task" ? (
          <>
            <label className="text-[11px] text-foreground-muted">Due date</label>
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updateTaskScheduleFromCalendarAction(
                    buildDueOnlyTaskTimingUpdate(
                      event.recordId,
                      dueDate ? new Date(dueDate) : null,
                      assigneeId || null,
                    ),
                  );
                })
              }
            >
              {isPending ? "Saving..." : "Save due date"}
            </Button>
            <div className="h-px w-full bg-border" />
            <label className="text-[11px] text-foreground-muted">Scheduled block</label>
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={scheduledStartAt}
              onChange={(e) => setScheduledStartAt(e.target.value)}
            />
            <input
              type="datetime-local"
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
              value={scheduledEndAt}
              onChange={(e) => setScheduledEndAt(e.target.value)}
            />
            <select
              className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
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
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updateTaskScheduleFromCalendarAction(
                    buildScheduledBlockTaskTimingUpdate(
                      event.recordId,
                      scheduledStartAt ? new Date(scheduledStartAt) : null,
                      scheduledEndAt ? new Date(scheduledEndAt) : null,
                      assigneeId || null,
                    ),
                  );
                })
              }
            >
              {isPending ? "Saving..." : "Save schedule block"}
            </Button>
            <Button
              size="sm"
              variant="muted"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updateTaskScheduleFromCalendarAction(
                    buildScheduledBlockTaskTimingUpdate(
                      event.recordId,
                      null,
                      null,
                      assigneeId || null,
                    ),
                  );
                  setScheduledStartAt("");
                  setScheduledEndAt("");
                })
              }
            >
              Clear scheduled block
            </Button>
          </>
        ) : null}

        {event.recordHref ? (
          <a
            href={event.recordHref}
            className="text-xs font-medium text-accent underline underline-offset-4"
          >
            Open record
          </a>
        ) : null}
      </div>
    </div>
  );
}

