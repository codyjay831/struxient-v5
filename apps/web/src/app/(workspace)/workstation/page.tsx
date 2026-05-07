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
import { queryWorkstationWorkItems, getWorkstationSummary, type WorkstationWorkItem } from "@/lib/workstation-query";
import { AttentionCard } from "@/components/ui/attention-card";
import { WorkstationWorkPanel } from "@/components/workstation/workstation-work-panel";
import { WorkstationTaskPanel } from "@/components/workstation/workstation-task-panel";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import { WorkstationLeadPanel } from "@/components/workstation/workstation-lead-panel";
import { WorkstationQuotePanel } from "@/components/workstation/workstation-quote-panel";
import { db } from "@/lib/db";
import { JobTaskStatus } from "@prisma/client";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";

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
                readyItems.slice(0, 5).map((item) => (
                  <WorkItemAttentionCard 
                    key={item.id} 
                    item={item} 
                    isSelected={selectedId === item.id}
                  />
                ))
              ) : (
                <p className="text-sm text-foreground-muted italic">No items ready to work.</p>
              )}
              {readyItems.length > 5 && (
                <Link href="/workstation/tasks" className="block text-center text-xs font-medium text-foreground-subtle hover:text-foreground transition-colors">
                  View all {readyItems.length} ready items →
                </Link>
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

async function LeadDetailWrapper({ leadId }: { leadId: string }) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true, contactName: true, email: true, phone: true, customerId: true },
  });

  if (!lead) return null;

  return (
    <WorkstationLeadPanel
      leadId={lead.id}
      initialStatus={lead.status}
      contactName={lead.contactName}
      email={lead.email}
      phone={lead.phone}
      hasCustomer={lead.customerId !== null}
    />
  );
}

async function QuoteDetailWrapper({ quoteId }: { quoteId: string }) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      job: true,
      lineItems: {
        include: {
          draftExecutionTasks: true,
        },
      },
    },
  });

  if (!quote) return null;

  const activationReadiness = evaluateQuoteJobActivationReadiness({
    status: quote.status,
    lines: quote.lineItems.map((l) => ({
      id: l.id,
      description: l.description,
      executionReviewStatus: l.executionReviewStatus,
      executionMergeMode: l.executionMergeMode,
      taskCount: l.draftExecutionTasks.length,
    })),
  });

  const readiness = getQuoteReadiness({
    quote: {
      status: quote.status,
      lineItemCount: quote.lineItems.length,
      subtotalCents: quote.subtotalCents,
      totalCents: quote.totalCents,
    },
    job: quote.job,
    activationReadiness: {
      ready: activationReadiness.ready,
      totalTasksToActivate: activationReadiness.totalTasksToActivate,
      needsAttentionLineCount: activationReadiness.blockReasons.filter(r => r.code === "LINE_NEEDS_EXECUTION_REVIEW").length,
      anomalyLineCount: activationReadiness.blockReasons.filter(r => r.code === "LINE_COMMERCIAL_ONLY_HAS_TASKS").length,
    },
  });

  return (
    <WorkstationQuotePanel
      quoteId={quote.id}
      initialStatus={quote.status}
      totalCents={quote.totalCents}
      readinessLabel={readiness.label}
    />
  );
}
