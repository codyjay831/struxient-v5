import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { db } from "@/lib/db";
import { queryOrganizationSchedule } from "@/lib/schedule-query";
import { getWeekRange } from "@/lib/scheduling/week-range";
import { queryWorkstationWorkItems } from "@/lib/workstation-query";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
  serializeWorkstationUrlState,
} from "@/lib/workstation/url-state";
import {
  clampWorkstationUrlStateForRole,
  getSpecForRole,
} from "@/lib/workstation/role-feeds";
import { canManageOrganizationSettings, canReadCommercial } from "@/lib/authz/capabilities";
import { getJobVisibilityWhere } from "@/lib/authz/resource-access";
import { resolveExecutableWorkItem } from "@/lib/workstation/schedule-event-task-routing";
import {
  resolveWorkstationSelectedItem,
} from "@/lib/workstation/resolve-work-item-selection";
import { buildWorkstationPresentation } from "@/lib/workstation-presentation";
import { usesGenericPanel } from "@/lib/workstation/uses-generic-panel";
import { WorkstationPanelContent } from "@/components/workstation/workstation-panel-content";
import { WorkstationSelectionModal } from "@/components/workstation/workstation-selection-modal";
import { WorkstationSettingsDrawer } from "@/components/workstation/workstation-settings-drawer";
import { WorkstationStatusBar } from "@/components/workstation/workstation-cockpit";
import { WorkstationOverview } from "@/components/workstation/workstation-overview";
import { WorkstationQueueView } from "@/components/workstation/workstation-queue";
import { WorkstationShell } from "@/components/workstation/workstation-shell";

export const dynamic = "force-dynamic";

const secondaryActionClass = buttonClassName({ variant: "muted", size: "sm" });

export default async function WorkstationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await getRequestContextOrThrow();
  const sp = await searchParams;
  const tabParam = typeof sp.tab === "string" ? sp.tab : undefined;
  const lensParam = typeof sp.lens === "string" ? sp.lens : undefined;

  if (!tabParam && !lensParam) {
    const roleSpec = getSpecForRole(ctx.role);
    if (roleSpec.defaultTab !== "overview") {
      redirect(
        `/workstation${serializeWorkstationUrlState({
          v: 1,
          tab: roleSpec.defaultTab,
          lens: roleSpec.defaultLens,
          filter: roleSpec.defaultFilter,
        })}`,
      );
    }
  }

  const urlStateRaw = parseWorkstationUrlState(sp);
  const clampedState = clampWorkstationUrlStateForRole(urlStateRaw, ctx.role);
  if (clampedState) {
    redirect(`/workstation${serializeWorkstationUrlState(clampedState)}`);
  }

  const urlState = urlStateRaw;
  const { tab, selected } = urlState;
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

  const now = new Date();
  const weekRange = getWeekRange(now);

  const commercialReadable = canReadCommercial(ctx.role);
  const canManageSettings = canManageOrganizationSettings(ctx.role);
  const jobVisibilityWhere = getJobVisibilityWhere(ctx.role, ctx.userId);

  const [schedule, recentActivity, unreviewedIntakesCount] = await Promise.all([
    queryOrganizationSchedule(ctx.organizationId, weekRange, ctx.role, ctx.userId),
    db.jobActivity.findMany({
      where: {
        job: { organizationId: ctx.organizationId, ...jobVisibilityWhere },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        actorUser: { select: { name: true } },
        job: {
          select: {
            id: true,
            title: true,
            customer: { select: { displayName: true } },
            lead: { select: { contact: true, request: true, address: true, signals: true } },
          },
        },
      },
    }),
    commercialReadable
      ? db.lead.count({
          where: {
            organizationId: ctx.organizationId,
            status: { in: [...LEAD_PIPELINE_OPEN_STATUSES] },
          },
        })
      : Promise.resolve(0),
  ]);

  const roleSpec = getSpecForRole(ctx.role);
  const presentation = buildWorkstationPresentation({
    items: allItems,
    scheduleEvents: schedule.events,
    recentActivityRaw: recentActivity,
    viewerUserId: ctx.userId,
    now,
    overviewLimits: roleSpec.overviewLimits,
  });

  const selectedItemRaw = resolveWorkstationSelectedItem(
    selectedId,
    allItems,
    schedule.events,
  );
  const selectedItem = selectedItemRaw
    ? resolveExecutableWorkItem(selectedItemRaw, allItems)
    : null;

  if (selectedId && !selectedItem) {
    const cleared = buildWorkstationUrl(urlState, { selected: undefined });
    redirect(`/workstation${cleared}`);
  }

  const highRiskCount = presentation.overviewNextActions.filter(
    (item) => item.tone === "danger",
  ).length;

  const tabCounts = {
    tasks: presentation.domainQueues.tasks.length,
    jobs: presentation.domainQueues.jobs.length,
    calendar: presentation.domainQueues.calendar.length,
    commercial: presentation.domainQueues.commercial.length,
    money: presentation.domainQueues.money.length,
    activity:
      presentation.domainQueues.activity.length + presentation.recentActivity.length,
  };

  const signalItems = [
    {
      id: "critical",
      label: "Critical",
      value: presentation.overviewCriticalGroups.reduce((n, g) => n + g.items.length, 0),
      context: `${highRiskCount} high risk`,
      tone: highRiskCount > 0 ? ("danger" as const) : ("neutral" as const),
      href: `/workstation${buildWorkstationUrl(urlState, { tab: "tasks", selected: undefined, filter: "all", queueFilter: "blocked" })}`,
    },
    {
      id: "today",
      label: "Today",
      value: presentation.signalStrip.todayCount,
      context: "scheduled / due",
      tone: presentation.signalStrip.todayCount > 0 ? ("warning" as const) : ("neutral" as const),
      href: `/workstation${buildWorkstationUrl(urlState, { tab: "calendar", selected: undefined, queueFilter: "today" })}`,
    },
    {
      id: "schedule-risk",
      label: "Schedule risk",
      value: presentation.signalStrip.scheduleRiskCount,
      context: "needs attention",
      tone:
        presentation.signalStrip.scheduleRiskCount > 0
          ? ("warning" as const)
          : ("neutral" as const),
      href: `/workstation${buildWorkstationUrl(urlState, { tab: "calendar", selected: undefined, queueFilter: "needs-schedule" })}`,
    },
    {
      id: "waiting",
      label: "Waiting",
      value: presentation.signalStrip.waitingCount,
      context: "external hold",
      tone:
        presentation.signalStrip.waitingCount > 0
          ? ("warning" as const)
          : ("neutral" as const),
      href: `/workstation${buildWorkstationUrl(urlState, { tab: "tasks", selected: undefined, queueFilter: "waiting" })}`,
    },
  ];

  const queueItemsByTab = {
    tasks: presentation.domainQueues.tasks,
    jobs: presentation.domainQueues.jobs,
    calendar: presentation.domainQueues.calendar,
    commercial: presentation.domainQueues.commercial,
    money: presentation.domainQueues.money,
    activity: presentation.domainQueues.activity,
  } as const;

  return (
    <div className="space-y-5">
      <WorkstationShell tabCounts={tabCounts} allowedTabs={roleSpec.allowedTabs} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground-muted">
            {presentation.overviewNextActions.length > 0
              ? `${presentation.overviewNextActions.length} ranked action${presentation.overviewNextActions.length === 1 ? "" : "s"} ready`
              : "No urgent work flagged."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showQuickActions && commercialReadable && quickActions.includes("new-intake") ? (
            <Link href="/leads/new" className={secondaryActionClass}>
              <Plus className="size-3.5" />
              New lead
            </Link>
          ) : null}
          {commercialReadable && unreviewedIntakesCount > 0 ? (
            <Link href="/leads?pipeline=active" className={secondaryActionClass}>
              <Users className="size-3.5" />
              Sales ({unreviewedIntakesCount})
            </Link>
          ) : null}
          {canManageSettings ? (
            <WorkstationSettingsDrawer
              initial={{ showQuickActions, quickActions, urgentThresholdHours }}
            />
          ) : null}
        </div>
      </div>

      {tab === "overview" ? (
        <>
          <WorkstationStatusBar items={[...signalItems]} />
          <WorkstationOverview
            presentation={presentation}
            urlState={urlState}
            selectedId={selectedId}
          />
        </>
      ) : (
        <WorkstationQueueView
          tab={tab}
          items={queueItemsByTab[tab]}
          activityItems={
            tab === "activity" ? presentation.recentActivity : undefined
          }
          urlState={urlState}
          selectedId={selectedId}
        />
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
