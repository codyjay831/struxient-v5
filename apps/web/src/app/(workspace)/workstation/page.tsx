import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { LEAD_PIPELINE_OPEN_STATUSES } from "@/lib/lead-display";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import {
  queryWorkstationWorkItems,
  compareWorkstationLeadOrder,
  type WorkstationWorkItem,
  type WorkstationLens,
  type WorkstationFilterCategory,
} from "@/lib/workstation-query";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import { loadJobTaskExecutionPayload } from "@/lib/job-task-execution-loader";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { WorkstationLeadPanel } from "@/components/workstation/workstation-lead-panel";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import { db } from "@/lib/db";
import { JobTaskStatus } from "@prisma/client";
import { getLeadCommercialProgress } from "@/lib/lead-commercial-progress";
import {
  formatLeadChannel,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { jobsiteLineFromLead } from "@/lib/jobsite-address";
import { intakeSnapshotForCustomerFromLead } from "@/lib/customer-service-location-from-lead";
import { projectLead, deriveLeadTitle } from "@/lib/lead/lead-projection";
import type { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";
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
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;
  const lens = (typeof sp.lens === "string" ? sp.lens : "attention") as WorkstationLens;
  const filter = (typeof sp.filter === "string" ? sp.filter : "all") as WorkstationFilterCategory;

  const settings = await db.workstationSettings.findUnique({
    where: { organizationId: ctx.organizationId },
  });

  const showQuickActions = settings?.showQuickActions ?? true;
  const quickActions = Array.isArray(settings?.quickActionsJson)
    ? (settings.quickActionsJson as string[])
    : ["new-intake", "new-quote", "browse-jobs"];
  const urgentThresholdHours = settings?.urgentThresholdHours ?? 24;

  const allItems = await queryWorkstationWorkItems(ctx.organizationId, urgentThresholdHours);

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

  // Helper to build hrefs that preserve lens/filter
  const buildItemHref = (item: WorkstationWorkItem) => {
    const p = new URLSearchParams();
    if (lens !== "attention") p.set("lens", lens);
    if (filter !== "all") p.set("filter", filter);
    p.set("selectedId", item.id);
    p.set("selectedKind", item.kind);
    return `?${p.toString()}`;
  };

  // Prioritize for the selected view
  const prioritizedItems = [...filteredItems].sort(compareWorkstationLeadOrder);

  const focusItem = prioritizedItems[0];
  const queueItems = prioritizedItems.slice(1);

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
          {quickActions.includes("new-quote") && (
            <Link href="/quotes/new" className={quickActionClass}>
              <Plus className="size-3.5" />
              New Quote
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
          {prioritizedItems.length > 0 ? (
            <div className="space-y-12">
              {/* Primary Focus */}
              {focusItem && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                      Primary Focus
                    </h3>
                  </div>
                  <WorkstationFocusCard 
                    item={{
                      ...focusItem,
                      href: buildItemHref(focusItem)
                    }} 
                    isSelected={selectedId === focusItem.id} 
                  />
                </section>
              )}

              {/* Secondary Queue */}
              {queueItems.length > 0 && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                      Queue
                    </h3>
                  </div>
                  <div className="grid gap-2">
                    {queueItems.map((item) => (
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

        {/* Sidebar: Activity & Insights */}
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

          <section className="rounded-xl border border-border bg-foreground/[0.01] p-5">
            <div className="flex items-center gap-2 mb-6">
              <Zap className="size-4 text-accent" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                Insights
              </h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                  <span>Job Velocity</span>
                  <span className="text-success">↑ 12%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-foreground/5">
                  <div className="h-full w-[75%] rounded-full bg-accent" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                  <span>Quote Conversion</span>
                  <span className="text-foreground">68%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-foreground/5">
                  <div className="h-full w-[68%] rounded-full bg-foreground/20" />
                </div>
              </div>
            </div>
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
      <div className="grid gap-6 border-t border-border pt-12 lg:grid-cols-2">
        <WorkspacePanel id="reserved-areas" padding="compact" className="bg-foreground/[0.01]">
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

        <HandoffPanel
          title="Authoritative record routes"
          description="Quotes and leads sit under Sales; customer rows under Relationships; job and schedule placeholders under Work."
        >
          <Link href="/quotes" className={handoffMutedLinkClass}>
            Quotes
          </Link>
          <Link href="/customers" className={handoffMutedLinkClass}>
            Customers
          </Link>
          <Link href="/jobs" className={handoffPrimaryLinkClass}>
            Job records
          </Link>
          <Link href="/schedule" className={handoffMutedLinkClass}>
            Schedule
          </Link>
        </HandoffPanel>
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
      stages: true,
      tasks: {
        where: { status: JobTaskStatus.TODO },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (!job) return null;

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: {
      jobId: job.id,
      status: JobTaskStatus.TODO,
      job: { organizationId: ctx.organizationId },
    },
  });

  return (
    <WorkstationJobPanel
      stageCount={stageCount}
      taskCount={activeTaskCount}
      nextTaskTitle={job.tasks[0]?.title}
    />
  );
}

const WORKSTATION_CUSTOMER_LINK_FETCH_CAP = 500;

async function LeadDetailWrapper({ leadId }: { leadId: string }) {
  const ctx = await getRequestContextOrThrow();

  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId },

    select: {
      id: true,
      status: true,
      contact: true,
      request: true,
      address: true,
      signals: true,
      channel: true,
      customerId: true,
      createdAt: true,
      customer: { select: { id: true, displayName: true } },
      visitRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) return null;

  const projected = projectLead({
    id: lead.id,
    status: lead.status,
    channel: lead.channel,
    customerId: lead.customerId,
    convertedAt: null,
    createdAt: lead.createdAt,
    updatedAt: lead.createdAt,
    contact: lead.contact,
    request: lead.request,
    address: lead.address,
    signals: lead.signals,
  });

  const jobsiteAddressLine = jobsiteLineFromLead({
    address: lead.address,
    signals: lead.signals,
  });

  const linkedQuotes = await db.quote.findMany({
    where: { leadId: lead.id, organizationId: ctx.organizationId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      totalCents: true,
      updatedAt: true,
      _count: { select: { lineItems: true } },
      job: { select: { id: true, status: true, organizationId: true } },
    },
  });

  const progress = getLeadCommercialProgress({
    lead: {
      status: lead.status,
      customerId: lead.customerId,
      email: projected.email,
      phone: projected.phone,
    },
    quotes: linkedQuotes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      updatedAt: q.updatedAt,
      job: q.job && q.job.organizationId === ctx.organizationId ? { id: q.job.id, status: q.job.status } : null,
    })),
  });

  const hasCustomer = lead.customerId !== null;
  let customersForLink: { id: string; displayName: string }[] | undefined;
  if (!hasCustomer) {
    const rows = await db.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { displayName: "asc" },
      take: WORKSTATION_CUSTOMER_LINK_FETCH_CAP,
      select: { id: true, displayName: true },
    });
    customersForLink = rows.map((c) => ({ id: c.id, displayName: c.displayName }));
  }


  const surfaceQuotes = linkedQuotes
    .filter((q) => q.status !== "ARCHIVED")
    .map((q) => ({
      id: q.id,
      title: q.title,
      statusLabel: formatQuoteStatus(q.status),
      statusTone: quoteStatusBadgeTone(q.status),
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      href: `/quotes/${q.id}`,
    }));

  /* Embed QuoteWorkSurface(standard) inside the Lead Quote tab when an active
   * quote exists. Same loader used by the Workstation quote drawer + full
   * Quote page so all containers see identical readiness state. */
  const activeQuoteId = progress.activeQuote?.id ?? null;
  const activeQuoteWorkSurface = activeQuoteId
    ? await loadQuoteWorkSurface(activeQuoteId, ctx.organizationId)
    : null;

  /* Pre-load Service address context for the Lead workspace Customer Info
   * block (same shape the Lead full page passes). */
  const intakeSnapshot = intakeSnapshotForCustomerFromLead({
    address: lead.address,
    signals: lead.signals,
  });
  const intakeForBlock = intakeSnapshot
    ? {
        defaultDisplayAddress:
          intakeSnapshot.formattedAddress.trim() ||
          intakeSnapshot.addressLine1.trim(),
        structuredJson: JSON.stringify(intakeSnapshot),
      }
    : { defaultDisplayAddress: "", structuredJson: "" };

  let serviceAddressContext: LeadServiceAddressContext;
  if (lead.customerId) {
    const customerLocations = await db.customerServiceLocation.findMany({
      where: { customerId: lead.customerId, organizationId: ctx.organizationId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        formattedAddress: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        googlePlaceId: true,
        latitude: true,
        longitude: true,
        source: true,
        isPrimary: true,
        createdFromLead: { select: { id: true, contact: true, request: true, channel: true } },
      },
    });
    serviceAddressContext = {
      customer: {
        customerId: lead.customerId,
        customerHref: `/customers/${lead.customerId}`,
        serviceLocations: customerLocations.map((loc) => ({
          id: loc.id,
          formattedAddress: loc.formattedAddress,
          addressLine1: loc.addressLine1,
          addressLine2: loc.addressLine2,
          city: loc.city,
          state: loc.state,
          postalCode: loc.postalCode,
          country: loc.country,
          googlePlaceId: loc.googlePlaceId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          source: loc.source,
          isPrimary: loc.isPrimary,
          createdFromLead: loc.createdFromLead
            ? {
                id: loc.createdFromLead.id,
                title: deriveLeadTitle(loc.createdFromLead.contact, loc.createdFromLead.request),
                channel: loc.createdFromLead.channel,
                source: loc.createdFromLead.channel,
              }
            : null,
        })),
      },
      intake: intakeForBlock,
    };
  } else {
    serviceAddressContext = { customer: null, intake: intakeForBlock };
  }


  return (
    <WorkstationLeadPanel
      leadId={lead.id}
      leadTitle={projected.title}
      contactName={projected.contactName}
      email={projected.email}
      phone={projected.phone}
      notes={projected.notes}
      statusValue={lead.status}
      statusLabel={formatLeadStatus(lead.status)}
      statusTone={leadStatusBadgeTone(lead.status)}
      sourceLabel={formatLeadChannel(lead.channel)}
      source={lead.channel}
      createdAtLabel={lead.createdAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}
      customerId={lead.customerId}
      customerDisplayName={lead.customer?.displayName ?? null}
      customerHref={lead.customer ? `/customers/${lead.customer.id}` : null}
      customersForLink={customersForLink}
      linkedQuotes={surfaceQuotes}
      progress={progress}
      activeQuoteWorkSurface={activeQuoteWorkSurface}
      jobsiteAddressLine={jobsiteAddressLine}
      serviceAddressContext={serviceAddressContext}
      visitRequests={lead.visitRequests.map((vr) => ({
        id: vr.id,
        requestedDate: vr.requestedDate,
        requestedDateLabel: vr.requestedDate
          ? vr.requestedDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null,
        requestedWindow: vr.requestedWindow,
        confirmedDate: vr.confirmedDate,
        status: vr.status,
        notes: vr.notes,
        createdAt: vr.createdAt,
      }))}
    />
  );
}

async function QuoteDetailWrapper({ quoteId }: { quoteId: string }) {
  const ctx = await getRequestContextOrThrow();
  const result = await loadQuoteWorkSurface(quoteId, ctx.organizationId);

  if (!result) return null;

  return (
    <QuoteWorkSurface
      mode="compact"
      quote={result.quote}
      readiness={result.readiness}
      workspaceTabs={result.workspaceTabs}
    />
  );
}
