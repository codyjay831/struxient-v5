import Link from "next/link";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { db } from "@/lib/db";
import { JobIssueSeverity, JobIssueStatus } from "@prisma/client";
import {
  queryWorkstationWorkItems,
  type WorkstationWorkItem,
} from "@/lib/workstation-query";
import {
  parseWorkstationUrlState,
  buildWorkstationUrl,
} from "@/lib/workstation/url-state";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import { loadJobTaskExecutionPayload } from "@/lib/job-task-execution-loader";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { loadLeadCommercialSurface } from "@/lib/lead-commercial-surface/loader";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import { 
  WorkstationFocusCard, 
  WorkstationQueueItem, 
  WorkstationClearedState,
  WorkstationFilterBar 
} from "@/components/workstation/workstation-ui";
import { Plus, ListOrdered, History, Zap } from "lucide-react";
import { WorkstationSettingsDrawer } from "@/components/workstation/workstation-settings-drawer";

export const dynamic = "force-dynamic";

const quickActionClass =
  "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle transition-all hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

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
              New Intake
            </Link>
          )}
          {quickActions.includes("browse-jobs") && (
            <Link href="/jobs" className={quickActionClass}>
              <ListOrdered className="size-3.5" />
              Browse Jobs
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
                  <h3 className="text-xs font-bold uppercase tracking-widest text-danger">
                    Critical / Blocking
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
                  <p className="text-xs text-foreground-muted italic">
                    Nothing critical. Pick from due today below.
                  </p>
                )}
              </section>

              {/* Due Today Lane */}
              {dueItems.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                      Due Today
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
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                      Upcoming / Prepare
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
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                      Watch / Aging
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
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                Recent Activity
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
                  className="mt-4 block text-center text-[10px] font-bold uppercase tracking-widest text-foreground-subtle hover:text-foreground transition-colors"
                >
                  View All Activity
                </Link>
              </div>
            ) : (
              <p className="text-xs text-foreground-muted italic">
                No recent activity recorded.
              </p>
            )}
          </section>
        </aside>
      </div>

      {selectedItem && (
        <div id="selected-item-panel" className="scroll-mt-6">
          <WorkstationWorkPanel item={selectedItem}>
            {selectedItem.kind === "task" && (
              <TaskDetailWrapper taskId={selectedItem.recordId} />
            )}
            {selectedItem.kind === "job" && (
              <JobDetailWrapper jobId={selectedItem.recordId} />
            )}
            {selectedItem.kind === "lead" && (
              <LeadDetailWrapper leadId={selectedItem.recordId} />
            )}
            {selectedItem.kind === "quote" && (
              <QuoteDetailWrapper quoteId={selectedItem.recordId} />
            )}
          </WorkstationWorkPanel>
        </div>
      )}

      {/* Footer Navigation */}
      <div className="border-t border-border pt-12">
        <WorkspacePanel id="reserved-areas" padding="compact" className="bg-foreground/[0.01] max-w-2xl">
          <SectionHeading title={WORKSTATION_COPY.reservedAreas.title} description={WORKSTATION_COPY.reservedAreas.description} />
          <div className="flex flex-wrap gap-2">
            <Link href="/workstation/tasks" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground">
              {WORKSTATION_COPY.reservedAreas.tasksLabel}
            </Link>
            <Link href="/workstation/jobs" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground">
              {WORKSTATION_COPY.reservedAreas.jobsLabel}
            </Link>
            <Link href="/workstation/schedule" className="inline-flex items-center rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground">
              {WORKSTATION_COPY.reservedAreas.scheduleLabel}
            </Link>
          </div>
        </WorkspacePanel>
      </div>
    </div>
  );
}

async function TaskDetailWrapper({ taskId }: { taskId: string }) {
  const ctx = await getRequestContextOrThrow();
  const payload = await loadJobTaskExecutionPayload(taskId, ctx.organizationId);

  if (!payload) return null;

  const { getLiveSignals } = await import("@/lib/signal-bus");
  const liveSignals = await getLiveSignals(payload.jobId);

  return <TaskWorkSurface {...payload} liveSignals={liveSignals} clearWorkstationSelectionOnComplete />;
}

async function JobDetailWrapper({ jobId }: { jobId: string }) {
  const ctx = await getRequestContextOrThrow();
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            select: { id: true, status: true, severity: true },
          },
        },
      },
      tasks: {
        where: { completedAt: null },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          status: true,
          completedAt: true,
          completionNote: true,
          completionRequirementsJson: true,
          requiresSignals: true,
          attachments: {
            where: { status: "READY" },
            select: { id: true },
          },
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            select: { id: true, status: true, severity: true },
          },
          recoveryFlow: { select: { jobIssueId: true } },
          jobStage: {
            select: {
              id: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  if (!job) return null;

  const { getLiveSignals } = await import("@/lib/signal-bus");
  const { deriveTaskState, toTaskReadinessInput } = await import("@/lib/task-readiness");
  const liveSignals = await getLiveSignals(job.id);

  const stageIssuesByJobStageId = new Map(
    job.stages.map((s) => [s.id, s.issues] as const),
  );

  const sortedTasks = [...job.tasks].sort((a, b) => {
    if (a.jobStage.sortOrder !== b.jobStage.sortOrder) {
      return a.jobStage.sortOrder - b.jobStage.sortOrder;
    }
    return a.sortOrder - b.sortOrder;
  });

  const nextReadyTask = sortedTasks.find((task) => {
    const readinessInput = toTaskReadinessInput(task, {
      requiresSignals: [],
      issues: stageIssuesByJobStageId.get(task.jobStage.id) ?? [],
    });
    const state = deriveTaskState(readinessInput, liveSignals, {
      recoveryFlowIssueId: task.recoveryFlow?.jobIssueId,
    });
    return state === "READY";
  });

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: {
      jobId: job.id,
      completedAt: null,
      job: { organizationId: ctx.organizationId },
    },
  });

  return (
    <WorkstationJobPanel
      stageCount={stageCount}
      taskCount={activeTaskCount}
      nextTaskTitle={nextReadyTask?.title ?? sortedTasks[0]?.title}
    />
  );
}

async function LeadDetailWrapper({ leadId }: { leadId: string }) {
  const ctx = await getRequestContextOrThrow();
  const payload = await loadLeadCommercialSurface(leadId, ctx);

  if (!payload) return null;

  return <LeadCommercialSurface payload={payload} entryPoint="workstation" />;
}

async function QuoteDetailWrapper({ quoteId }: { quoteId: string }) {
  const ctx = await getRequestContextOrThrow();
  const result = await loadQuoteWorkSurface(quoteId, ctx.organizationId);

  if (!result) return null;

  return (
    <QuoteWorkSurface
      quote={result.quote}
      readiness={result.readiness}
      workspaceTabs={result.workspaceTabs}
    />
  );
}
