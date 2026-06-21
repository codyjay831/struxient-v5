import type { ScheduleEvent } from "@/lib/schedule-query";
import type { WorkstationWorkItem, WorkstationWorkItemKind } from "@/lib/workstation-query";
import {
  findTaskWorkItemForScheduleEvent,
  resolveExecutableWorkItem,
} from "./schedule-event-task-routing";

export const BOARD_SCHEDULE_EVENT_ID_PREFIX = "board-sched-event-";
export const BOARD_LEAD_VISIT_ID_PREFIX = "board-lead-visit-";

/** Map a calendar/schedule event to a Workstation work item for in-place selection. */
export function findOrBuildWorkItemForScheduleEvent(
  event: ScheduleEvent,
  allItems: WorkstationWorkItem[],
): WorkstationWorkItem | null {
  if (event.kind === "task" && event.recordId) {
    return allItems.find((i) => i.kind === "task" && i.recordId === event.recordId) ?? null;
  }

  if (event.kind === "lead-visit-request" && event.parentId) {
    const leadItem = allItems.find((i) => i.kind === "lead" && i.recordId === event.parentId);
    if (leadItem) return leadItem;

    return {
      id: `${BOARD_LEAD_VISIT_ID_PREFIX}${event.recordId}`,
      kind: "lead",
      title: event.title,
      subtitle: event.subtitle,
      status: event.status,
      priority: "medium",
      group: "scheduled",
      lens: "today",
      lane: "due",
      withinLaneRank: 0,
      filterCategory: "leads",
      reason: "Lead visit scheduled.",
      nextStep: "Review visit details.",
      recordId: event.parentId,
      href: `/leads/${event.parentId}`,
      updatedAt: event.startAt,
    };
  }

  if (event.kind === "schedule-block") {
    return null;
  }

  const linkedTaskItem = findTaskWorkItemForScheduleEvent(event.recordId, allItems);
  if (linkedTaskItem) return linkedTaskItem;

  const existingSchedule = allItems.find(
    (i) => i.kind === "schedule" && i.recordId === event.recordId,
  );
  if (existingSchedule) return existingSchedule;

  const jobId = event.parentId;
  if (!jobId || !event.recordId) return null;

  return {
    id: `${BOARD_SCHEDULE_EVENT_ID_PREFIX}${event.recordId}`,
    kind: "schedule",
    title: event.title,
    subtitle: event.subtitle,
    status: event.status,
    priority: "medium",
    group: "scheduled",
    lens: "today",
    lane: "due",
    withinLaneRank: 0,
    filterCategory: "jobs",
    reason: "Scheduled commitment.",
    nextStep: "Review and update the visit.",
    recordId: event.recordId,
    parentRecordId: jobId,
    href: `/jobs/${jobId}`,
    updatedAt: event.startAt,
  };
}

export function buildWorkItemSelectionHref(
  item: WorkstationWorkItem,
  buildUrl: (updates: { selected: { id: string; kind: WorkstationWorkItemKind } }) => string,
): string {
  return buildUrl({ selected: { id: item.id, kind: item.kind } });
}

export function resolveWorkstationSelectedItem(
  selectedId: string | undefined,
  allItems: WorkstationWorkItem[],
  scheduleEvents: ScheduleEvent[] = [],
): WorkstationWorkItem | null {
  if (!selectedId) return null;

  const direct = allItems.find((i) => i.id === selectedId);
  if (direct) return resolveExecutableWorkItem(direct, allItems);

  if (selectedId.startsWith(BOARD_SCHEDULE_EVENT_ID_PREFIX)) {
    const recordId = selectedId.slice(BOARD_SCHEDULE_EVENT_ID_PREFIX.length);
    const event = scheduleEvents.find((e) => e.recordId === recordId);
    if (event) {
      const resolved = findOrBuildWorkItemForScheduleEvent(event, allItems);
      return resolved ? resolveExecutableWorkItem(resolved, allItems) : null;
    }
  }

  if (selectedId.startsWith(BOARD_LEAD_VISIT_ID_PREFIX)) {
    const visitId = selectedId.slice(BOARD_LEAD_VISIT_ID_PREFIX.length);
    const event = scheduleEvents.find(
      (e) => e.kind === "lead-visit-request" && e.recordId === visitId,
    );
    if (event) {
      const resolved = findOrBuildWorkItemForScheduleEvent(event, allItems);
      return resolved ? resolveExecutableWorkItem(resolved, allItems) : null;
    }
  }

  // Lead cards disappear from the feed once a quote exists; keep the drawer open
  // on the same opportunity via the quote card anchored to that lead.
  if (selectedId.startsWith("lead-")) {
    const leadId = selectedId.slice("lead-".length);
    const quoteForLead = allItems.find(
      (item) => item.kind === "quote" && item.leadAnchorId === leadId,
    );
    if (quoteForLead) {
      return resolveExecutableWorkItem(quoteForLead, allItems);
    }
  }

  return null;
}
