import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClassName } from "@/components/ui/button";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SummaryStrip, type SummaryStripItem } from "@/components/ui/summary-strip";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { resolveJobActivitySubtitle } from "@/lib/work-item-context";
import { resolveJobsiteLineForQuoteOrJob } from "@/lib/jobsite-address";
import { db } from "@/lib/db";
import { leadShouldAppearInBoardAttention } from "@/lib/workstation-lead-attention";
import {
  queryWorkstationWorkItems,
  type WorkstationWorkItem,
} from "@/lib/workstation-query";
import { queryOrganizationSchedule } from "@/lib/schedule-query";
import { formatTime } from "@/lib/scheduling/format-time";
import { getWeekRange, getWeekDays, isOnDay } from "@/lib/scheduling/week-range";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import {
  findOrBuildWorkItemForScheduleEvent,
  resolveWorkstationSelectedItem,
} from "@/lib/workstation/resolve-work-item-selection";
import { resolveExecutableWorkItem } from "@/lib/workstation/schedule-event-task-routing";
import { WorkstationSelectionModal } from "@/components/workstation/workstation-selection-modal";
import { usesGenericPanel } from "@/lib/workstation/uses-generic-panel";
import { WorkstationPanelContent } from "@/components/workstation/workstation-panel-content";
import {
  WorkstationQueueItem,
  WorkstationClearedState,
  WorkstationFilterBar,
} from "@/components/workstation/workstation-ui";
import {
  BoardCriticalBar,
  BoardSectionHeading,
  BoardTodayList,
  BoardAttentionList,
  BoardPaymentsPanel,
  WorkstationWeekCalendar,
  BoardRecentChangeRow,
  BoardEmptyState,
  type BoardTodayEntry,
  type BoardWeekDay,
  type BoardWeekEvent,
} from "@/components/workstation/the-board";
import { WorkstationSettingsDrawer } from "@/components/workstation/workstation-settings-drawer";
import { Plus, ListOrdered, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const quickActionClass = buttonClassName({ variant: "muted", size: "sm" });

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function WorkstationPage({
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

  const allItems = await queryWorkstationWorkItems(
    ctx.organizationId,
    ctx.role,
    ctx.userId,
    urgentThresholdHours,
  );

  const isLandingView = lens === "attention";

  // ── THE BOARD (default landing) ────────────────────────────────────────────
  if (isLandingView) {
    const now = new Date();
    const weekRange = getWeekRange(now);
    const weekDays = getWeekDays(now);

    const [schedule, recentActivity, unreviewedIntakesCount] = await Promise.all([
      queryOrganizationSchedule(ctx.organizationId, weekRange, ctx.role, ctx.userId),
      db.jobActivity.findMany({
        where: { job: { organizationId: ctx.organizationId } },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: {
          actorUser: { select: { name: true } },
          job: {
            select: {
              title: true,
              customer: { select: { displayName: true } },
              lead: { select: { contact: true, request: true, address: true, signals: true } },
            },
          },
        },
      }),
      db.lead.count({
        where: {
          organizationId: ctx.organizationId,
          status: { in: [...LEAD_PIPELINE_OPEN_STATUSES] },
        },
      }),
    ]);

    const activityItems = recentActivity.map((activity) => {
      const jobsite = resolveJobsiteLineForQuoteOrJob({
        serviceLocation: null,
        customerLocations: [],
        leadRow: activity.job.lead
          ? { address: activity.job.lead.address, signals: activity.job.lead.signals }
          : null,
      });
      return {
        id: activity.id,
        title: activity.title,
        subtitle: resolveJobActivitySubtitle({
          jobTitle: activity.job.title,
          customer: activity.job.customer,
          lead: activity.job.lead,
          jobsiteLine: jobsite,
          actorName: activity.actorUser?.name,
        }),
      };
    });

    const buildItemHref = (item: WorkstationWorkItem) =>
      buildWorkstationUrl(urlState, { selected: { id: item.id, kind: item.kind } });
    // Board rows open the task work surface when a schedule signal is linked to a task.
    const withSelectHref = (item: WorkstationWorkItem): WorkstationWorkItem => {
      const executable = resolveExecutableWorkItem(item, allItems);
      return { ...executable, href: buildItemHref(executable) };
    };

    // Critical: top exception bar — overdue/critical items and issue blockers only.
    const criticalItems = allItems
      .filter((i) => i.priority === "critical" || (i.isBlocked && !i.isWaitingOnSignals))
      .sort((a, b) => a.withinLaneRank - b.withinLaneRank)
      .map(withSelectHref);

    const criticalIds = new Set(criticalItems.map((i) => i.id));

    // Payments due — own panel.
    const paymentItems = allItems
      .filter((i) => i.filterCategory === "payments")
      .sort((a, b) => a.withinLaneRank - b.withinLaneRank)
      .map(withSelectHref);
    const paymentIds = new Set(paymentItems.map((i) => i.id));

    // Needs attention — investigate/issue-blocked items not already in the critical bar
    // or payments panel (excludes normal prerequisite waits). Includes ready-to-quote leads.
    const attentionItems = allItems
      .filter(
        (i) =>
          !criticalIds.has(i.id) &&
          !paymentIds.has(i.id) &&
          (leadShouldAppearInBoardAttention({
            kind: i.kind as "lead",
            group: i.group,
            priority: i.priority,
            isBlocked: i.isBlocked,
            isWaitingOnSignals: i.isWaitingOnSignals,
          }) ||
            (i.kind !== "lead" &&
              !i.isWaitingOnSignals &&
              (i.group === "investigate" || i.group === "blocked" || i.isBlocked))),
      )
      .sort((a, b) => a.withinLaneRank - b.withinLaneRank)
      .slice(0, 8)
      .map(withSelectHref);

    // Today: my open tasks (due/overdue/scheduled today) + today's events.
    const myTodayTaskItems = allItems.filter(
      (i) =>
        i.kind === "task" &&
        i.assignedUserId === ctx.userId &&
        (i.status === "Overdue" ||
          i.status === "Due today" ||
          (i.scheduledStartAt != null && isOnDay(new Date(i.scheduledStartAt), now)) ||
          (i.dueAt != null && isOnDay(new Date(i.dueAt), now))),
    );

    const taskEntries: BoardTodayEntry[] = myTodayTaskItems.map((item) => {
      const start = item.scheduledStartAt ? new Date(item.scheduledStartAt) : null;
      const due = item.dueAt ? new Date(item.dueAt) : null;
      const urgent = item.status === "Overdue" || item.priority === "critical";
      return {
        id: item.id,
        time: start ?? due,
        timeLabel: start
          ? formatTime(start)
          : item.status === "Overdue"
            ? "Overdue"
            : "Due",
        title: item.title,
        context: item.contextLine ?? item.parentLabel ?? item.subtitle,
        href: buildItemHref(item),
        urgent,
        scroll: false,
      };
    });

    // Today's schedule events (exclude task-due events — tasks come from items
    // above to avoid duplicates). Show events assigned to me or unassigned.
    const todayEventEntries: BoardTodayEntry[] = schedule.events
      .filter(
        (e) =>
          e.kind !== "task" &&
          isOnDay(e.startAt, now) &&
          (e.assigneeUserId == null || e.assigneeUserId === ctx.userId),
      )
      .flatMap((e) => {
        const workItem = findOrBuildWorkItemForScheduleEvent(e, allItems);
        if (!workItem) return [];
        const executable = resolveExecutableWorkItem(workItem, allItems);
        return [
          {
            id: `sched-${e.id}`,
            time: e.startAt,
            timeLabel: e.allDay ? "All day" : formatTime(e.startAt),
            title: e.title,
            context: e.subtitle ?? e.assigneeLabel ?? undefined,
            href: buildItemHref(executable),
            urgent: false,
            scroll: false,
          },
        ];
      });

    const todayEntries = [...taskEntries, ...todayEventEntries].sort((a, b) => {
      if (a.time && b.time) return a.time.getTime() - b.time.getTime();
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });

    // Week calendar — group all events by day.
    const weekCalendarDays: BoardWeekDay[] = weekDays.map((day) => {
      const dayEvents: BoardWeekEvent[] = schedule.events
        .filter((e) => isOnDay(e.startAt, day.date))
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((e) => {
          const workItem = findOrBuildWorkItemForScheduleEvent(e, allItems);
          const executable = workItem
            ? resolveExecutableWorkItem(workItem, allItems)
            : null;
          return {
            id: e.id,
            title: e.title,
            timeLabel: e.allDay ? "" : formatTime(e.startAt),
            href: executable ? buildItemHref(executable) : undefined,
            tone:
              e.kind === "lead-visit-request"
                ? ("accent" as const)
                : e.kind === "task"
                  ? ("danger" as const)
                  : ("default" as const),
          };
        });
      return {
        iso: isoDay(day.date),
        weekday: day.date.toLocaleDateString("en-US", { weekday: "short" }),
        dayNumber: day.date.getDate(),
        isToday: day.isToday,
        events: dayEvents,
      };
    });

    const myOpenTaskCount = allItems.filter(
      (i) => i.kind === "task" && i.assignedUserId === ctx.userId,
    ).length;
    const weekEventCount = schedule.events.length;
    const needsActionCount =
      criticalItems.length + attentionItems.length + paymentItems.length;

    // Selection works across all items (cross-section), including calendar events.
    const selectedItemRaw = resolveWorkstationSelectedItem(
      selectedId,
      allItems,
      schedule.events,
    );
    const selectedItem = selectedItemRaw
      ? resolveExecutableWorkItem(selectedItemRaw, allItems)
      : null;
    if (selectedId && !selectedItem) {
      redirect("/workstation");
    }

    const summaryItems: SummaryStripItem[] = [
      {
        id: "today",
        label: "Today",
        value: todayEntries.length,
        tone: "neutral",
        anchorId: "board-today",
      },
      {
        id: "my-tasks",
        label: "My tasks",
        value: myOpenTaskCount,
        tone: "neutral",
      },
      {
        id: "week",
        label: "This week",
        value: weekEventCount,
        tone: "neutral",
        anchorId: "board-week",
      },
      {
        id: "needs-action",
        label: "Needs action",
        value: needsActionCount,
        tone: needsActionCount > 0 ? "danger" : "success",
        anchorId: "board-attention",
      },
    ];

    const hasAnything =
      criticalItems.length > 0 ||
      todayEntries.length > 0 ||
      attentionItems.length > 0 ||
      paymentItems.length > 0 ||
      weekEventCount > 0;

    return (
      <div className="space-y-8">
        {/* Top bar: quick actions + settings */}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {showQuickActions && (
              <>
                {quickActions.includes("new-intake") && (
                  <Link href="/leads/new" className={quickActionClass}>
                    <Plus className="size-3.5" />
                    New lead
                  </Link>
                )}
                {unreviewedIntakesCount > 0 && (
                  <Link href="/leads?pipeline=active" className={quickActionClass}>
                    <div className="relative">
                      <Users className="size-3.5" />
                      <span className="absolute -right-1 -top-1 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                      </span>
                    </div>
                    Review sales ({unreviewedIntakesCount})
                  </Link>
                )}
                {quickActions.includes("browse-jobs") && (
                  <Link href="/workstation/jobs" className={quickActionClass}>
                    <ListOrdered className="size-3.5" />
                    Browse jobs
                  </Link>
                )}
              </>
            )}
          </div>
          <WorkstationSettingsDrawer
            initial={{ showQuickActions, quickActions, urgentThresholdHours }}
          />
        </div>

        {!hasAnything ? (
          <BoardEmptyState />
        ) : (
          <>
            <SummaryStrip items={summaryItems} />

            {/* Critical exception bar — only when present */}
            <BoardCriticalBar items={criticalItems} />

            {/* Today + Needs attention */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <section id="board-today" className="lg:col-span-7">
                <WorkspacePanel padding="comfortable" className="h-full">
                  <BoardSectionHeading
                    title="Today"
                    count={todayEntries.length}
                    icon="clock"
                  />
                  <BoardTodayList entries={todayEntries} />
                </WorkspacePanel>
              </section>

              <section id="board-attention" className="lg:col-span-5">
                <WorkspacePanel padding="comfortable" className="h-full space-y-4">
                  <div>
                    <BoardSectionHeading
                      title="Needs attention"
                      count={attentionItems.length}
                      countTone="danger"
                      icon="alert"
                    />
                    <BoardAttentionList items={attentionItems} selectedId={selectedId} />
                  </div>
                  <BoardPaymentsPanel items={paymentItems} selectedId={selectedId} />
                </WorkspacePanel>
              </section>
            </div>

            {/* This week calendar */}
            <section id="board-week">
              <BoardSectionHeading
                title="This week"
                count={weekEventCount}
                icon="calendar"
              />
              <WorkstationWeekCalendar days={weekCalendarDays} />
            </section>
          </>
        )}

        {/* Footer: recent changes + browse */}
        <div className="border-t border-border pt-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {activityItems.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground-subtle">
                  Recent changes
                </h2>
                {activityItems.map((a) => (
                  <BoardRecentChangeRow key={a.id} item={a} />
                ))}
              </section>
            )}
            <section className={activityItems.length > 0 ? "md:text-right" : ""}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground-subtle">
                Browse
              </h2>
              <div className="flex flex-wrap gap-4 md:justify-end">
                <Link
                  href={buildWorkstationUrl(urlState, {
                    lens: "all",
                    filter: "tasks",
                    selected: undefined,
                  })}
                  className="text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
                >
                  {WORKSTATION_COPY.reservedAreas.tasksLabel} →
                </Link>
                <Link
                  href="/workstation/jobs"
                  className="text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
                >
                  {WORKSTATION_COPY.reservedAreas.jobsLabel} →
                </Link>
                <Link
                  href="/workstation/schedule"
                  className="text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
                >
                  {WORKSTATION_COPY.reservedAreas.scheduleLabel} →
                </Link>
              </div>
            </section>
          </div>
        </div>

        <WorkstationSelectionModal
          item={selectedItem ?? null}
          genericContent={
            selectedItem && usesGenericPanel(selectedItem) ? (
              <WorkstationPanelContent item={selectedItem} />
            ) : undefined
          }
        />
      </div>
    );
  }

  // ── SECONDARY LENS VIEWS (waiting, upcoming, all) ─────────────────────────
  let filteredItems =
    lens === "all" ? allItems : allItems.filter((i) => i.lens === lens);

  if (filter !== "all") {
    filteredItems = filteredItems.filter((i) => i.filterCategory === filter);
  }

  filteredItems = filteredItems.sort((a, b) => a.withinLaneRank - b.withinLaneRank);

  const selectedItem = selectedId
    ? filteredItems.find((i) => i.id === selectedId)
    : null;
  if (selectedId && !selectedItem) {
    const cleared = buildWorkstationUrl(urlState, { selected: undefined });
    redirect(`/workstation${cleared}`);
  }

  const buildItemHref = (item: WorkstationWorkItem) =>
    buildWorkstationUrl(urlState, { selected: { id: item.id, kind: item.kind } });

  return (
    <div className="space-y-8">
      {lens === "all" && (
        <div className="border-b border-border pb-4">
          <WorkstationFilterBar currentFilter={filter} />
        </div>
      )}

      {filteredItems.length > 0 ? (
        <div className="grid gap-2">
          {filteredItems.slice(0, 30).map((item) => (
            <WorkstationQueueItem
              key={item.id}
              item={{ ...item, href: buildItemHref(item) }}
              isSelected={selectedId === item.id}
            />
          ))}
        </div>
      ) : (
        <WorkstationClearedState lens={lens} filter={filter} />
      )}

      <WorkstationSelectionModal
        item={selectedItem ?? null}
        genericContent={
          selectedItem && usesGenericPanel(selectedItem) ? (
            <WorkstationPanelContent item={selectedItem} />
          ) : undefined
        }
      />
    </div>
  );
}
