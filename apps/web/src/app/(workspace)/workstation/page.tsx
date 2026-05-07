import Link from "next/link";
import {
  HandoffPanel,
  handoffMutedLinkClass,
  handoffPrimaryLinkClass,
} from "@/components/ui/handoff-panel";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { PageHeader } from "@/components/ui/page-header";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { SummaryStrip, type SummaryStripItem } from "@/components/ui/summary-strip";
import { getDevOrganizationOrThrow } from "@/lib/db";
import { WORKSTATION_COPY } from "@/lib/workstation-copy";
import { buildWorkstationSelectHref } from "@/lib/workstation-return-href";
import {
  queryWorkstationWorkItems,
  getWorkstationSummary,
  compareWorkstationSalesIntakeOrder,
  type WorkstationWorkItem,
} from "@/lib/workstation-query";
import { AttentionCard } from "@/components/ui/attention-card";
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

export const dynamic = "force-dynamic";

export default async function WorkstationTodayLensPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const org = await getDevOrganizationOrThrow();
  const sp = await searchParams;
  const selectedId = typeof sp.selectedId === "string" ? sp.selectedId : undefined;

  const allItems = await queryWorkstationWorkItems(org.id);
  const summary = getWorkstationSummary(allItems);

  const investigateItems = allItems.filter((i) => i.group === "investigate");
  const readyItems = allItems.filter((i) => i.group === "ready" || i.group === "active");
  const waitingItems = allItems.filter((i) => i.group === "waiting");
  
  // "Needs attention" = high/critical priority items
  const attentionItems = allItems.filter((i) => i.priority === "critical" || i.priority === "high");

  const selectedItem = selectedId ? allItems.find((i) => i.id === selectedId) : null;

  const salesIntakeItems = allItems
    .filter((i) => i.kind === "lead" || i.kind === "quote")
    .sort(compareWorkstationSalesIntakeOrder);

  const summaryItems: SummaryStripItem[] = [
    {
      id: "investigate",
      label: "Investigate",
      value: summary.investigateCount,
      hint: "Records needing review.",
      tone: summary.investigateCount > 0 ? "danger" : "neutral",
      anchorId: "investigate",
    },
    {
      id: "active-jobs",
      label: "Active jobs",
      value: summary.activeJobsCount,
      hint: "Jobs currently in motion.",
      tone: "neutral",
      anchorId: "active-jobs",
    },
    {
      id: "open-tasks",
      label: "Open tasks",
      value: summary.openTasksCount,
      hint: "Tasks waiting to be done.",
      tone: "neutral",
      anchorId: "ready-to-work",
    },
    {
      id: "sales-intake",
      label: "Sales intake",
      value: summary.openLeadsQuotesCount,
      hint: "Leads and quotes in progress.",
      tone: "neutral",
      anchorId: "sales-intake",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb items={[{ label: "Workstation" }]} />
      <PageHeader
        title="Workstation Today"
        description="Your central command surface for prioritized work and decisions across Struxient."
      />

      <div className="space-y-6">
        <SummaryStrip items={summaryItems} />

        <WorkspacePanel id="sales-intake" padding="compact" className="scroll-mt-6">
          <SectionHeading
            title="Sales intake"
            description="Open leads and quotes in one place — urgency matches the Investigate / Ready / Waiting lanes below."
          />
          {salesIntakeItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {salesIntakeItems.map((item) => (
                <WorkItemAttentionCard
                  key={item.id}
                  item={item}
                  isSelected={selectedId === item.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-5">
              <p className="text-sm font-medium text-foreground">No open leads or quotes</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                When drafts, sent quotes, or qualifying leads exist for this organization, they land here and in the sections below.
              </p>
            </div>
          )}
        </WorkspacePanel>

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

        {attentionItems.length > 0 && (
          <WorkspacePanel id="attention" padding="compact" className="border-danger/20 bg-danger/[0.01] scroll-mt-6">
            <SectionHeading
              title="Needs attention"
              description="High-priority items that may block progress or need immediate review."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {attentionItems.map((item) => (
                <WorkItemAttentionCard 
                  key={item.id} 
                  item={item} 
                  isSelected={selectedId === item.id}
                />
              ))}
            </div>
          </WorkspacePanel>
        )}

        <WorkspacePanel id="investigate" padding="compact" className="border-border-strong scroll-mt-6">
          <SectionHeading
            title={WORKSTATION_COPY.investigate.sectionTitle}
            description={WORKSTATION_COPY.investigate.sectionDescription}
          />
          {investigateItems.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {investigateItems.map((item) => (
                <WorkItemAttentionCard 
                  key={item.id} 
                  item={item} 
                  isSelected={selectedId === item.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface/50 px-4 py-5">
              <p className="text-sm font-medium text-foreground">
                {WORKSTATION_COPY.investigate.emptyTitle}
              </p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                {WORKSTATION_COPY.investigate.emptyDescription}
              </p>
            </div>
          )}
        </WorkspacePanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <WorkspacePanel id="ready-to-work" padding="compact" className="scroll-mt-6">
            <SectionHeading
              title="Ready to work"
              description="Tasks and jobs that are unblocked and ready for the next step."
            />
            <div className="space-y-3">
              {readyItems.length > 0 ? (
                readyItems.slice(0, 10).map((item) => (
                  <WorkItemAttentionCard 
                    key={item.id} 
                    item={item} 
                    isSelected={selectedId === item.id}
                  />
                ))
              ) : (
                <p className="text-sm text-foreground-muted italic">No items ready to work.</p>
              )}
              {readyItems.length > 10 && (
                <p className="text-center text-xs text-foreground-muted">
                  Showing 10 of {readyItems.length} ready items — see Sales intake for the full lead and quote list.
                </p>
              )}
            </div>
          </WorkspacePanel>

          <WorkspacePanel id="waiting" padding="compact" className="scroll-mt-6">
            <SectionHeading
              title="Waiting / Follow-up"
              description="Items waiting on customer action or future events."
            />
            <div className="space-y-3">
              {waitingItems.length > 0 ? (
                waitingItems.slice(0, 5).map((item) => (
                  <WorkItemAttentionCard 
                    key={item.id} 
                    item={item} 
                    isSelected={selectedId === item.id}
                  />
                ))
              ) : (
                <p className="text-sm text-foreground-muted italic">No items waiting.</p>
              )}
            </div>
          </WorkspacePanel>
        </div>

        <WorkspacePanel id="active-jobs" padding="compact" className="scroll-mt-6">
          <SectionHeading
            title="Active jobs"
            description="Overview of jobs currently in motion."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allItems.filter(i => i.kind === "job").map(item => (
               <WorkItemAttentionCard 
                 key={item.id} 
                 item={item} 
                 isSelected={selectedId === item.id}
               />
            ))}
          </div>
          {allItems.filter(i => i.kind === "job").length === 0 && (
            <p className="text-sm text-foreground-muted italic">No active jobs found.</p>
          )}
        </WorkspacePanel>

        <WorkspacePanel id="sales-intake" padding="compact" className="scroll-mt-6">
          <SectionHeading
            title="Sales intake"
            description="Leads and quotes currently being processed."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allItems.filter(i => i.kind === "lead" || i.kind === "quote").map(item => (
               <WorkItemAttentionCard 
                 key={item.id} 
                 item={item} 
                 isSelected={selectedId === item.id}
               />
            ))}
          </div>
          {allItems.filter(i => i.kind === "lead" || i.kind === "quote").length === 0 && (
            <p className="text-sm text-foreground-muted italic">No active leads or quotes found.</p>
          )}
        </WorkspacePanel>

        <WorkspacePanel id="reserved-areas" padding="compact" className="bg-foreground/[0.01] scroll-mt-6">
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
          description="Quotes and leads sit under Sales; customer rows under Relationships; job and schedule placeholders under Work. Workstation surfaces signals from these records."
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

function WorkItemAttentionCard({ item, isSelected }: { item: WorkstationWorkItem; isSelected?: boolean }) {
  return (
    <AttentionCard
      title={item.title}
      eyebrow={item.kind}
      statusLabel={item.workflow?.statusLabel}
      recordLabel={item.subtitle || ""}
      severity={item.priority === "critical" ? "high" : item.priority}
      reason={item.reason}
      suggestedAction={item.nextStep}
      href={buildWorkstationSelectHref(item.id, item.kind)}
      secondaryHref={item.href}
      secondaryActionLabel="Open full record"
      origin="derived"
      isSelected={isSelected}
    />
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
    />
  );
}
