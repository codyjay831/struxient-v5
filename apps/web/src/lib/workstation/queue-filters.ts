import type { WorkstationTab } from "./url-state";
import type { CommercialSegment, QueueRowItem } from "@/lib/workstation-presentation";

const COMMERCIAL_FILTER_TO_SEGMENT: Record<string, CommercialSegment> = {
  leads: "lead",
  quotes: "quote",
  "change-orders": "change_order",
  "customer-responses": "customer_response",
  "needs-setup": "needs_setup",
};

export function applyWorkstationQueueFilter(
  items: QueueRowItem[],
  tab: WorkstationTab,
  queueFilter: string,
): QueueRowItem[] {
  if (queueFilter === "all") return items;

  if (tab === "tasks") {
    if (queueFilter === "blocked")
      return items.filter((i) => i.tone === "danger" || i.statusLabel === "Blocked");
    if (queueFilter === "due")
      return items.filter(
        (i) => i.statusLabel === "Due today" || i.statusLabel === "Overdue",
      );
    if (queueFilter === "ready")
      return items.filter((i) => i.statusLabel === "Ready" || i.statusLabel === "Needs proof");
    if (queueFilter === "waiting") return items.filter((i) => i.isWaiting);
  }

  if (tab === "jobs") {
    if (queueFilter === "risk") return items.filter((i) => i.tone !== "neutral");
    if (queueFilter === "blocked")
      return items.filter((i) => i.tone === "danger" || i.statusLabel === "Blocked");
  }

  if (tab === "calendar") {
    if (queueFilter.startsWith("day:")) {
      const dayKey = queueFilter.slice(4);
      return items.filter((i) => i.calendarDay === dayKey);
    }
    if (queueFilter === "today") return items.filter((i) => i.statusLabel === "Due today");
    if (queueFilter === "upcoming")
      return items.filter((i) => i.statusLabel !== "Due today" && i.statusLabel !== "Overdue");
    if (queueFilter === "needs-schedule")
      return items.filter((i) => i.statusLabel === "Needs schedule" || i.statusLabel === "Missed");
  }

  if (tab === "commercial") {
    const segment = COMMERCIAL_FILTER_TO_SEGMENT[queueFilter];
    if (segment) {
      return items.filter((i) => i.commercialSegments?.includes(segment));
    }
  }

  if (tab === "money") {
    if (queueFilter === "due") return items.filter((i) => i.tone === "warning");
    if (queueFilter === "holds") return items.filter((i) => i.tone === "danger");
  }

  return items;
}

export function countWorkstationQueueFilters(
  items: QueueRowItem[],
  tab: WorkstationTab,
  filters: { label: string; filter: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of filters) {
    counts[f.filter] = applyWorkstationQueueFilter(items, tab, f.filter).length;
  }
  return counts;
}
