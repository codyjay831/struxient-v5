import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getDevOrganizationOrThrow } from "@/lib/db";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { buildWorkstationSelectHref } from "@/lib/workstation-return-href";
import {
  queryWorkstationWorkItems,
  getWorkstationSummary,
  compareWorkstationSalesIntakeOrder,
  type WorkstationWorkItem,
} from "@/lib/workstation-query";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationTaskPanel } from "@/components/workstation/workstation-task-panel";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { WorkstationLeadPanel } from "@/components/workstation/workstation-lead-panel";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import { loadQuoteWorkSurface } from "@/lib/quote-work-surface-loader";
import { db } from "@/lib/db";
import { JobTaskStatus } from "@prisma/client";
import { getLeadCommercialProgress } from "@/lib/lead-commercial-progress";
import {
  formatLeadSource,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { 
  WorkstationFocusCard, 
  WorkstationQueueItem, 
  WorkstationClearedState,
  WorkstationFilterBar 
} from "@/components/workstation/workstation-ui";

export const dynamic = "force-dynamic";

export default async function WorkstationTodayLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const org = await getDevOrganizationOrThrow();
  const sp = await searchParams;
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;
  const lens = (typeof sp.lens === "string" ? sp.lens : "attention") as any;
  const filter = (typeof sp.filter === "string" ? sp.filter : "all") as any;

  const allItems = await queryWorkstationWorkItems(org.id);
  const summary = getWorkstationSummary(allItems);

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
  const prioritizedItems = [...filteredItems].sort(compareWorkstationSalesIntakeOrder);

  const focusItem = prioritizedItems[0];
  const queueItems = prioritizedItems.slice(1);

  return (
    <div className="space-y-8">
      <WorkstationFilterBar currentFilter={filter} currentLens={lens} />

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
  const task = await db.jobTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, instructions: true },
  });

  if (!task) return null;

  return (
    <WorkstationTaskPanel
      taskId={task.id}
      initialStatus={task.status}
      instructions={task.instructions}
    />
  );
}

async function JobDetailWrapper({ jobId }: { jobId: string }) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    include: {
      stages: true,
      tasks: {
        where: { status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] } },
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
    },
  });

  if (!job) return null;

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: { jobId: job.id, status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] } },
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
  const org = await getDevOrganizationOrThrow();

  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: org.id },
    select: {
      id: true,
      status: true,
      title: true,
      contactName: true,
      email: true,
      phone: true,
      notes: true,
      source: true,
      customerId: true,
      createdAt: true,
      customer: { select: { id: true, displayName: true } },
    },
  });

  if (!lead) return null;

  const linkedQuotes = await db.quote.findMany({
    where: { leadId: lead.id, organizationId: org.id },
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
      email: lead.email,
      phone: lead.phone,
    },
    quotes: linkedQuotes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      updatedAt: q.updatedAt,
      job: q.job && q.job.organizationId === org.id ? { id: q.job.id, status: q.job.status } : null,
    })),
  });

  const hasCustomer = lead.customerId !== null;
  let customersForLink: { id: string; displayName: string }[] | undefined;
  if (!hasCustomer) {
    const rows = await db.customer.findMany({
      where: { organizationId: org.id },
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
    ? await loadQuoteWorkSurface(activeQuoteId, org.id)
    : null;

  return (
    <WorkstationLeadPanel
      leadId={lead.id}
      leadTitle={lead.title}
      contactName={lead.contactName}
      email={lead.email}
      phone={lead.phone}
      notes={lead.notes}
      statusValue={lead.status}
      statusLabel={formatLeadStatus(lead.status)}
      statusTone={leadStatusBadgeTone(lead.status)}
      sourceLabel={formatLeadSource(lead.source)}
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
    />
  );
}

async function QuoteDetailWrapper({ quoteId }: { quoteId: string }) {
  const org = await getDevOrganizationOrThrow();
  const result = await loadQuoteWorkSurface(quoteId, org.id);
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
