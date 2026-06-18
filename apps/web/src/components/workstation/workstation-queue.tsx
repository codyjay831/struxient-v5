"use client";

import Link from "next/link";
import type { WorkstationTab } from "@/lib/workstation/url-state";
import {
  buildWorkstationUrl,
  parseWorkstationUrlState,
  WORKSTATION_TABS,
} from "@/lib/workstation/url-state";
import {
  applyWorkstationQueueFilter,
  countWorkstationQueueFilters,
} from "@/lib/workstation/queue-filters";
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
  activity: "No recent changes to review.",
};

export function WorkstationQueueView({
  tab,
  items,
  activityItems,
  urlState,
  selectedId,
}: {
  tab: Exclude<WorkstationTab, "overview">;
  items: QueueRowItem[];
  activityItems?: ActivityItem[];
  urlState: ReturnType<typeof parseWorkstationUrlState>;
  selectedId?: string;
}) {
  const queueFilter = urlState.queueFilter ?? "all";
  const tabMeta = WORKSTATION_TABS.find((t) => t.tab === tab);
  const filters = TAB_FILTERS[tab] ?? [];
  const filterCounts = countWorkstationQueueFilters(items, tab, filters);
  const filtered = applyWorkstationQueueFilter(items, tab, queueFilter);

  function buildHref(row: { selectedId: string; selectedKind: string }) {
    return buildWorkstationUrl(urlState, {
      selected: {
        id: row.selectedId,
        kind: row.selectedKind as Exclude<WorkstationWorkItem["kind"], "daily-log">,
      },
    });
  }

  function buildActivityHref(item: ActivityItem): string | undefined {
    if (!item.selectedId || !item.selectedKind) {
      return item.fallbackHref;
    }
    return buildWorkstationUrl(urlState, {
      selected: {
        id: item.selectedId,
        kind: item.selectedKind as Exclude<WorkstationWorkItem["kind"], "daily-log">,
      },
    });
  }

  function buildFilterHref(filter: string) {
    return buildWorkstationUrl(urlState, {
      tab,
      queueFilter: filter === "all" ? undefined : filter,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      {filters.length > 0 ? (
        <aside className="space-y-1 border-border lg:border-r lg:pr-4">
          <p className="mb-2 text-xs font-medium text-foreground-subtle">Filter</p>
          {filters.map((f) => {
            const href = buildFilterHref(f.filter);
            const active = queueFilter === f.filter;
            const count = filterCounts[f.filter] ?? 0;
            return (
              <Link
                key={f.filter}
                href={href}
                scroll={false}
                className={
                  active
                    ? "flex items-center justify-between rounded-md bg-foreground/[0.04] px-2 py-1.5 text-sm font-medium text-foreground"
                    : "flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-foreground-muted transition-colors hover:bg-foreground/[0.02] hover:text-foreground"
                }
              >
                <span>{f.label}</span>
                {count > 0 ? (
                  <span className="tabular-nums text-xs text-foreground-subtle">{count}</span>
                ) : null}
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
                <p className="mb-2 text-xs font-medium text-foreground-subtle">Needs review</p>
                <QueueRowList
                  items={filtered}
                  buildHref={buildHref}
                  emptyMessage={TAB_EMPTY.activity}
                  selectedId={selectedId}
                />
              </div>
            ) : null}
            {activityItems && activityItems.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium text-foreground-subtle">Recent changes</p>
                <ActivityFeedList
                  items={activityItems}
                  buildHref={buildActivityHref}
                  selectedId={selectedId}
                />
              </div>
            ) : filtered.length === 0 ? (
              <ActivityFeedList
                items={activityItems ?? []}
                buildHref={buildActivityHref}
                selectedId={selectedId}
              />
            ) : null}
          </div>
        ) : (
          <QueueRowList
            items={filtered}
            buildHref={buildHref}
            emptyMessage={TAB_EMPTY[tab]}
            selectedId={selectedId}
          />
        )}
      </section>
    </div>
  );
}
