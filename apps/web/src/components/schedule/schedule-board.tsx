"use client";

import { useMemo, useState, useTransition } from "react";
import type {
  ScheduleConflict,
  ScheduleEvent,
  UnscheduledScheduleItem,
} from "@/lib/schedule-query";
import type { ScheduleUrlView } from "@/lib/scheduling/schedule-url-state";
import { parseDatetimeLocalInTimezone } from "@/lib/scheduling/deadline-timezone";
import { upsertScheduleBlockAction } from "@/app/(workspace)/schedule/schedule-actions";
import { getActionErrorMessage } from "@/components/jobs/action-error-message";
import {
  ScheduleAddBlockButton,
  ScheduleAssigneeFilter,
  ScheduleBlockForm,
  ScheduleCalendarShell,
} from "./schedule-calendar-shell";
import { ScheduleEventDetailsDrawer } from "./schedule-event-details-drawer";
import { ScheduleUnscheduledTray } from "./schedule-unscheduled-tray";

type MemberOption = { id: string; label: string };

function filterEventsByAssignee(events: ScheduleEvent[], assigneeId: string): ScheduleEvent[] {
  if (assigneeId === "all") return events;
  return events.filter((event) => event.assigneeUserId === assigneeId);
}

export function ScheduleBoard({
  events,
  unscheduled,
  conflicts,
  members,
  anchorDate,
  view,
  timeZone,
}: {
  events: ScheduleEvent[];
  unscheduled: UnscheduledScheduleItem[];
  conflicts: ScheduleConflict[];
  members: MemberOption[];
  anchorDate: string;
  view: ScheduleUrlView | null;
  timeZone: string;
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
  const [blockMessage, setBlockMessage] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);

  const hasActiveFilters = selectedMemberId !== "all";

  const filteredEvents = useMemo(
    () => filterEventsByAssignee(events, selectedMemberId),
    [events, selectedMemberId],
  );

  const drawerEvent = useMemo(() => {
    if (!selectedEvent) return null;
    return filteredEvents.some((e) => e.id === selectedEvent.id) ? selectedEvent : null;
  }, [filteredEvents, selectedEvent]);

  const effectiveTrayOpen = trayOpen && unscheduled.length > 0;

  const selectedEventConflicts = useMemo(() => {
    if (!drawerEvent) return [];
    return conflicts.filter((c) => c.eventIds.includes(drawerEvent.id));
  }, [conflicts, drawerEvent]);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-elevated shadow-[var(--shadow-soft)]">
      <ScheduleCalendarShell
        events={filteredEvents}
        conflicts={conflicts}
        anchorDate={anchorDate}
        view={view}
        timeZone={timeZone}
        onEventClick={setSelectedEvent}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => setSelectedMemberId("all")}
        unscheduledCount={unscheduled.length}
        trayOpen={effectiveTrayOpen}
        onTrayToggle={() => setTrayOpen((v) => !v)}
        filterRow={
          <ScheduleAssigneeFilter
            members={members}
            value={selectedMemberId}
            onChange={setSelectedMemberId}
          />
        }
        blockForm={
          showBlockForm ? (
            <div className="space-y-2">
              {blockMessage ? (
                <p className="text-xs text-destructive">{blockMessage}</p>
              ) : null}
              <ScheduleBlockForm
                blockTitle={blockTitle}
                blockType={blockType}
                blockStart={blockStart}
                blockEnd={blockEnd}
                isPending={isPending}
                onTitleChange={setBlockTitle}
                onTypeChange={setBlockType}
                onStartChange={setBlockStart}
                onEndChange={setBlockEnd}
                onSave={() =>
                  startTransition(async () => {
                    setBlockMessage(null);
                    const result = await upsertScheduleBlockAction({
                      title: blockTitle,
                      type: blockType,
                      startAt: parseDatetimeLocalInTimezone(blockStart, timeZone),
                      endAt: blockEnd
                        ? parseDatetimeLocalInTimezone(blockEnd, timeZone)
                        : undefined,
                    });
                    if (result.error) {
                      setBlockMessage(getActionErrorMessage(result.error));
                      return;
                    }
                    setBlockTitle("");
                    setBlockStart("");
                    setBlockEnd("");
                    setShowBlockForm(false);
                  })
                }
              />
            </div>
          ) : null
        }
        trayPanel={
          effectiveTrayOpen ? (
            <ScheduleUnscheduledTray
              items={unscheduled}
              onClose={() => setTrayOpen(false)}
              className="max-h-[50vh] lg:max-h-none lg:w-72"
            />
          ) : null
        }
      >
        <ScheduleAddBlockButton
          showForm={showBlockForm}
          onToggle={() => setShowBlockForm((v) => !v)}
        />
      </ScheduleCalendarShell>

      <ScheduleEventDetailsDrawer
        event={drawerEvent}
        members={members}
        timeZone={timeZone}
        conflicts={selectedEventConflicts}
        open={drawerEvent !== null}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
