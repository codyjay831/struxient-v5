"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { WorkstationTab } from "@/lib/workstation/url-state";
import {
  buildWorkstationUrl,
  parseWorkstationUrlState,
  WORKSTATION_TABS,
} from "@/lib/workstation/url-state";
import type { QueueRowItem } from "@/lib/workstation-presentation";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import { QueueRowList, ActivityFeedList } from "./workstation-cockpit";
import type { ActivityItem } from "@/lib/workstation-presentation";

const TAB_FILTERS: Partial<
  Record<WorkstationTab, { label: string; filter: string }[]>
> = {
  tasks: [
    { label: "All", filter: "all" },
    { label: "Blocked", filter: "blocked" },
    { label: "Due", filter: "due" },
    { label: "Ready", filter: "ready" },
  ],
  jobs: [
    { label: "All", filter: "all" },
    { label: "At risk", filter: "risk" },
    { label: "Blocked", filter: "blocked" },
  ],
  calendar: [
    { label: "All", filter: "all" },
    { label: "Today", filter: "today" },
    { label: "Upcoming", filter: "upcoming" },
    { label: "Needs schedule", filter: "needs-schedule" },
  ],
  commercial: [
    { label: "All", filter: "all" },
    { label: "Leads", filter: "leads" },
    { label: "Quotes", filter: "quotes" },
  ],
  money: [
    { label: "All", filter: "all" },
    { label: "Due", filter: "due" },
    { label: "Holds", filter: "holds" },
  ],
};

const TAB_EMPTY: Record<Exclude<WorkstationTab, "overview">, string> = {
  tasks: "No tasks need attention right now.",
  jobs: "No active jobs need review.",
  calendar: "No schedule items flagged.",
  commercial: "No leads or quotes need follow-up.",
  money: "No payment actions due.",
  activity: "No recent activity to review.",
};

function applyQueueFilter(
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
  }

  if (tab === "jobs") {
    if (queueFilter === "risk") return items.filter((i) => i.tone !== "neutral");
    if (queueFilter === "blocked")
      return items.filter((i) => i.tone === "danger" || i.statusLabel === "Blocked");
  }

  if (tab === "calendar") {
    if (queueFilter === "today") return items.filter((i) => i.statusLabel === "Due today");
    if (queueFilter === "upcoming")
      return items.filter((i) => i.statusLabel !== "Due today" && i.statusLabel !== "Overdue");
    if (queueFilter === "needs-schedule")
      return items.filter((i) => i.statusLabel === "Needs schedule" || i.statusLabel === "Missed");
  }

  if (tab === "commercial") {
    if (queueFilter === "leads") return items.filter((i) => i.categoryLabel === "Leads & Quotes");
    if (queueFilter === "quotes") return items.filter((i) => i.title.toLowerCase().includes("quote"));
  }

  if (tab === "money") {
    if (queueFilter === "due") return items.filter((i) => i.tone === "warning");
    if (queueFilter === "holds") return items.filter((i) => i.tone === "danger");
  }

  return items;
}

export function WorkstationQueueView({
  tab,
  items,
  activityItems,
  urlState,
}: {
  tab: Exclude<WorkstationTab, "overview">;
  items: QueueRowItem[];
  activityItems?: ActivityItem[];
  urlState: ReturnType<typeof parseWorkstationUrlState>;
}) {
  const searchParams = useSearchParams();
  const queueFilter = searchParams.get("queueFilter") ?? "all";
  const tabMeta = WORKSTATION_TABS.find((t) => t.tab === tab);
  const filters = TAB_FILTERS[tab] ?? [];
  const filtered = applyQueueFilter(items, tab, queueFilter);

  function buildHref(row: { selectedId: string; selectedKind: string }) {
    return buildWorkstationUrl(urlState, {
      selected: {
        id: row.selectedId,
        kind: row.selectedKind as Exclude<WorkstationWorkItem["kind"], "daily-log">,
      },
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      {filters.length > 0 ? (
        <aside className="space-y-1 border-border lg:border-r lg:pr-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
            Filter
          </p>
          {filters.map((f) => {
            const href =
              f.filter === "all"
                ? buildWorkstationUrl(urlState, { tab })
                : `${buildWorkstationUrl(urlState, { tab })}&queueFilter=${f.filter}`;
            const active = queueFilter === f.filter;
            return (
              <Link
                key={f.filter}
                href={href}
                scroll={false}
                className={
                  active
                    ? "block rounded-md bg-foreground/[0.04] px-2 py-1.5 text-sm font-medium text-foreground"
                    : "block rounded-md px-2 py-1.5 text-sm text-foreground-muted transition-colors hover:text-foreground"
                }
              >
                {f.label}
              </Link>
            );
          })}
        </aside>
      ) : null}

      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">{tabMeta?.label}</h2>
          <p className="text-xs text-foreground-muted">
            {tabMeta?.description} · {filtered.length} item{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        {tab === "activity" ? (
          <div className="space-y-6">
            {filtered.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Needs review
                </p>
                <QueueRowList
                  items={filtered}
                  buildHref={buildHref}
                  emptyMessage={TAB_EMPTY.activity}
                />
              </div>
            ) : null}
            {activityItems && activityItems.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
                  Recent changes
                </p>
                <ActivityFeedList items={activityItems} />
              </div>
            ) : filtered.length === 0 ? (
              <ActivityFeedList items={activityItems ?? []} />
            ) : null}
          </div>
        ) : (
          <QueueRowList
            items={filtered}
            buildHref={buildHref}
            emptyMessage={TAB_EMPTY[tab]}
          />
        )}
      </section>
    </div>
  );
}
