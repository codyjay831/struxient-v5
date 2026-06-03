import Link from "next/link";
import { buttonClassName, ButtonLink } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { db } from "@/lib/db";
import {
  queryWorkstationWorkItems,
  type WorkstationWorkItem,
} from "@/lib/workstation-query";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationPanelContent } from "@/components/workstation/workstation-panel-content";
import { 
  WorkstationFocusCard, 
  WorkstationQueueItem, 
  WorkstationClearedState,
  WorkstationFilterBar 
} from "@/components/workstation/workstation-ui";
import { Plus, ListOrdered, History, Zap } from "lucide-react";
import { WorkstationSettingsDrawer } from "@/components/workstation/workstation-settings-drawer";

export const dynamic = "force-dynamic";

const quickActionClass = buttonClassName({ variant: "muted", size: "sm" });

const activityItemClass =
  "flex items-start gap-3 rounded-lg border border-transparent p-2 transition-colors hover:bg-foreground/[0.02]";

export default async function WorkstationTodayLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const urlState = parseWorkstationUrlState(sp);
  const { lens, filter, selected } = urlState;
  const selectedId = selected?.id;

  const settings = await db.workstationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
  });

  const showQuickActions = settings?.showQuickActions ?? true;
  const quickActions = Array.isArray(settings?.quickActionsJson)
    ? (settings.quickActionsJson as string[])
    : ["new-intake", "browse-jobs"];
  const urgentThresholdHours = settings?.urgentThresholdHours ?? 24;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, ctx.role, urgentThresholdHours);

  // Fetch recent activity for Priority 3 Notifications/Activity
  const recentActivity = await db.jobActivity.findMany({
    where: { job: { organizationId: ctx.organizationId } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      actorUser: { select: { name: true } },
      job: { select: { title: true } },
    },
  });

  const unreviewedIntakesCount = await db.lead.count({
    where: { organizationId: ctx.organizationId, status: { in: [...LEAD_PIPELINE_OPEN_STATUSES] } },
  });

  // Filter by lens
  let filteredItems = allItems;
  if (lens !== "all") {
    filteredItems = allItems.filter((i) => i.lens === lens);
  }

  // Filter by category
  if (filter !== "all") {
    filteredItems = filteredItems.filter((i) => i.filterCategory === filter);
  }

  const selectedItem = selectedId ? allItems.find((i) => i.id === selectedId) : null;

  // Group by lane
  const criticalItems = filteredItems.filter((i) => i.lane === "critical").sort((a, b) => a.withinLaneRank - b.withinLaneRank);
  const dueItems = filteredItems.filter((i) => i.lane === "due").sort((a, b) => a.withinLaneRank - b.withinLaneRank);
  const upcomingItems = filteredItems.filter((i) => i.lane === "upcoming").sort((a, b) => a.withinLaneRank - b.withinLaneRank);
  const watchItems = filteredItems.filter((i) => i.lane === "watch").sort((a, b) => a.withinLaneRank - b.withinLaneRank);

  // Helper to build hrefs that preserve lens/filter
  const buildItemHref = (item: WorkstationWorkItem) => {
    return buildWorkstationUrl(urlState, {
      selected: { id: item.id, kind: item.kind }
    });
  };

  const LANE_CAP = 10;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <WorkstationFilterBar currentFilter={filter} currentLens={lens} />
        <WorkstationSettingsDrawer 
          initial={{
            showQuickActions,
            quickActions,
            urgentThresholdHours,
          }}
        />
      </div>

      {/* Quick Actions */}
      {showQuickActions && (
        <section className="flex flex-wrap items-center gap-2">
          {quickActions.includes("new-intake") && (
            <Link href="/leads/new" className={quickActionClass}>
              <div className="relative">
                <Plus className="size-3.5" />
                {unreviewedIntakesCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
                  </span>
                )}
              </div>
              New lead
            </Link>
          )}
          {quickActions.includes("browse-jobs") && (
            <Link href="/jobs" className={quickActionClass}>
              <ListOrdered className="size-3.5" />
              Browse jobs
            </Link>
          )}
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-12">
          {filteredItems.length > 0 ? (
            <div className="space-y-12">
              {/* Critical Lane */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-danger">
                    Critical
                  </h3>
                </div>
                {criticalItems.length > 0 ? (
                  <div className="space-y-4">
                    {criticalItems.slice(0, 3).map((item) => (
                      <WorkstationFocusCard 
                        key={item.id}
                        item={{
                          ...item,
                          href: buildItemHref(item)
                        }} 
                        isSelected={selectedId === item.id} 
                      />
                    ))}
                    {criticalItems.length > 3 && (
                      <div className="grid gap-2">
                        {criticalItems.slice(3, LANE_CAP).map((item) => (
                          <WorkstationQueueItem 
                            key={item.id} 
                            item={{
                              ...item,
                              href: buildItemHref(item)
                            }} 
                            isSelected={selectedId === item.id} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-muted">
                    Nothing urgent — check due today below.
                  </p>
                )}
              </section>

              {/* Due Today Lane */}
              {dueItems.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Due today
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {dueItems.slice(0, LANE_CAP).map((item) => (
                      <WorkstationQueueItem 
                        key={item.id} 
                        item={{
                          ...item,
                          href: buildItemHref(item)
                        }} 
                        isSelected={selectedId === item.id} 
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Upcoming Lane */}
              {upcomingItems.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">
                      Upcoming
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {upcomingItems.slice(0, 5).map((item) => (
                      <WorkstationQueueItem 
                        key={item.id} 
                        item={{
                          ...item,
                          href: buildItemHref(item)
                        }} 
                        isSelected={selectedId === item.id} 
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Watch Lane */}
              {watchItems.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground-subtle">
                      Watch list
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {watchItems.slice(0, 5).map((item) => (
                      <WorkstationQueueItem 
                        key={item.id} 
                        item={{
                          ...item,
                          href: buildItemHref(item)
                        }} 
                        isSelected={selectedId === item.id} 
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <WorkstationClearedState lens={lens} filter={filter} />
          )}
        </div>

        {/* Sidebar: Activity */}
        <aside className="space-y-8">
          <section className="rounded-xl border border-border bg-foreground/[0.01] p-5">
            <div className="flex items-center gap-2 mb-6">
              <History className="size-4 text-foreground-subtle" />
              <h3 className="text-sm font-semibold text-foreground">
                Recent activity
              </h3>
            </div>
            
            {recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className={activityItemClass}>
                    <div className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                      <Zap className="size-3 text-foreground-subtle" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground leading-snug">
                        {activity.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-foreground-subtle truncate">
                        {activity.job.title} · {activity.actorUser?.name || "System"}
                      </p>
                    </div>
                  </div>
                ))}
                <Link 
                  href="/jobs" 
                  className="mt-4 block text-center text-sm font-medium text-accent hover:underline"
                >
                  View all activity
                </Link>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">
                No recent activity.
              </p>
            )}
          </section>
        </aside>
      </div>

      {selectedItem && (
        <div id="selected-item-panel" className="scroll-mt-6">
          <WorkstationWorkPanel item={selectedItem}>
            <WorkstationPanelContent item={selectedItem} />
          </WorkstationWorkPanel>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="border-t border-border pt-12">
        <WorkspacePanel id="reserved-areas" padding="compact" className="bg-foreground/[0.01] max-w-2xl">
          <SectionHeading title={WORKSTATION_COPY.reservedAreas.title} description={WORKSTATION_COPY.reservedAreas.description} />
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/workstation/tasks" variant="muted" size="sm">
              {WORKSTATION_COPY.reservedAreas.tasksLabel}
            </ButtonLink>
            <ButtonLink href="/workstation/jobs" variant="muted" size="sm">
              {WORKSTATION_COPY.reservedAreas.jobsLabel}
            </ButtonLink>
            <ButtonLink href="/workstation/schedule" variant="muted" size="sm">
              {WORKSTATION_COPY.reservedAreas.scheduleLabel}
            </ButtonLink>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}
