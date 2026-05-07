import {
  JobStatus,
  JobTaskStatus,
  LeadStatus,
  QuoteStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";

export type WorkstationWorkItemKind =
  | "lead"
  | "quote"
  | "job"
  | "task"
  | "schedule"
  | "investigate";

export type WorkstationWorkItemPriority = "critical" | "high" | "medium" | "low";

export type WorkstationWorkItemGroup =
  | "investigate"
  | "ready"
  | "active"
  | "waiting"
  | "scheduled"
  | "blocked";

export type WorkstationWorkItem = {
  id: string;
  kind: WorkstationWorkItemKind;
  title: string;
  subtitle?: string;
  status?: string;
  priority: WorkstationWorkItemPriority;
  group: WorkstationWorkItemGroup;
  reason: string;
  nextStep: string;
  recordId: string;
  parentRecordId?: string;
  parentLabel?: string;
  href?: string;
  updatedAt: Date;
};

export type WorkstationSummary = {
  investigateCount: number;
  activeJobsCount: number;
  openTasksCount: number;
  openLeadsQuotesCount: number;
  scheduledTodayCount: number;
};

export async function queryWorkstationWorkItems(organizationId: string): Promise<WorkstationWorkItem[]> {
  const items: WorkstationWorkItem[] = [];

  // 1. Leads
  const leads = await db.lead.findMany({
    where: { organizationId, status: { in: [LeadStatus.OPEN, LeadStatus.QUALIFYING] } },
    include: { customer: true, quotes: { where: { status: { not: QuoteStatus.ARCHIVED } } } },
  });

  for (const lead of leads) {
    const isUnlinked = lead.customerId === null;
    const hasActiveQuote = lead.quotes.length > 0;
    
    // If it has an active quote, we might want to skip the generic lead signal
    // unless it's missing a customer (which is critical).
    if (hasActiveQuote && !isUnlinked) continue;

    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      status: lead.status,
      priority: isUnlinked ? "high" : "medium",
      group: isUnlinked ? "investigate" : "ready",
      reason: isUnlinked ? "Opportunity has no linked customer." : "New sales opportunity.",
      nextStep: isUnlinked ? "Link or create a customer." : "Review and qualify.",
      recordId: lead.id,
      href: `/leads/${lead.id}`,
      updatedAt: lead.updatedAt,
    });
  }

  // 2. Quotes
  const quotes = await db.quote.findMany({
    where: { organizationId, status: { in: [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.APPROVED] } },
    include: {
      customer: true,
      lead: true,
      job: true,
      lineItems: {
        include: {
          draftExecutionTasks: true,
        },
      },
    },
  });

  for (const quote of quotes) {
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

    if (readiness.state === "JOB_ACTIVE" || readiness.state === "ARCHIVED") continue;

    let group: WorkstationWorkItemGroup = "ready";
    let priority: WorkstationWorkItemPriority = "medium";

    if (readiness.state === "SENT_AWAITING_CUSTOMER") {
      group = "waiting";
      priority = "low";
    } else if (readiness.state === "APPROVED_READY_TO_ACTIVATE") {
      group = "ready";
      priority = "high";
    } else if (readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW") {
      group = "investigate";
      priority = "high";
    }

    const primaryIdentity = quote.lead?.title || quote.customer?.displayName || quote.title;
    const secondaryIdentity = quote.title !== primaryIdentity ? quote.title : null;

    const parentLabel = quote.customer?.displayName || quote.lead?.title || undefined;
    const subtitle = secondaryIdentity 
      ? `Quote: ${secondaryIdentity}`
      : (quote.customer?.displayName || undefined);

    items.push({
      id: `quote-${quote.id}`,
      kind: "quote",
      title: primaryIdentity,
      subtitle,
      status: quote.status,
      priority,
      group,
      reason: readiness.description,
      nextStep: readiness.primaryAction?.label || "Review quote.",
      recordId: quote.id,
      parentRecordId: quote.customerId || quote.leadId || undefined,
      parentLabel,
      // Point to the lead/opportunity page if linked, as it's the main workspace now
      href: quote.leadId ? `/leads/${quote.leadId}` : `/quotes/${quote.id}`,
      updatedAt: quote.updatedAt,
    });
  }

  // 3. Jobs & Tasks
  const jobs = await db.job.findMany({
    where: { organizationId, status: JobStatus.ACTIVE },
    include: {
      customer: true,
      lead: true,
      tasks: {
        where: { status: { in: [JobTaskStatus.TODO, JobTaskStatus.IN_PROGRESS] } },
        include: { jobStage: true },
      },
    },
  });

  for (const job of jobs) {
    // Job itself as a work item if it has no tasks? Or just surface active jobs.
    // The requirement says "Active jobs with next task / task count / stage count".
    
    for (const task of job.tasks) {
      const primaryJobIdentity = job.lead?.title || job.customer?.displayName || job.title;
      const secondaryJobIdentity = job.title !== primaryJobIdentity ? job.title : null;

      items.push({
        id: `task-${task.id}`,
        kind: "task",
        title: task.title,
        subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""} · ${task.jobStage.title}`,
        status: task.status,
        priority: task.status === JobTaskStatus.IN_PROGRESS ? "high" : "medium",
        group: "active",
        reason: task.status === JobTaskStatus.IN_PROGRESS ? "Task is currently in progress." : "Task is ready to start.",
        nextStep: task.status === JobTaskStatus.IN_PROGRESS ? "Complete the task." : "Start the task.",
        recordId: task.id,
        parentRecordId: job.id,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`, // Detail panel will handle specific task view
        updatedAt: task.updatedAt,
      });
    }

    // If job has no active tasks, maybe it needs attention?
    if (job.tasks.length === 0) {
      const primaryJobIdentity = job.lead?.title || job.customer?.displayName || job.title;
      const secondaryJobIdentity = job.title !== primaryJobIdentity ? job.title : null;

      items.push({
        id: `job-${job.id}`,
        kind: "job",
        title: primaryJobIdentity,
        subtitle: secondaryJobIdentity || job.customer?.displayName || undefined,
        status: job.status,
        priority: "medium",
        group: "investigate",
        reason: "Active job has no remaining TODO or IN_PROGRESS tasks.",
        nextStep: "Review job completion or add tasks.",
        recordId: job.id,
        parentRecordId: job.customerId || job.leadId || undefined,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: job.updatedAt,
      });
    }
  }

  return items;
}

export function getWorkstationSummary(items: WorkstationWorkItem[]): WorkstationSummary {
  return {
    investigateCount: items.filter((i) => i.group === "investigate").length,
    activeJobsCount: new Set(items.filter((i) => i.kind === "job" || i.kind === "task").map((i) => i.parentRecordId || i.recordId)).size,
    openTasksCount: items.filter((i) => i.kind === "task").length,
    openLeadsQuotesCount: items.filter((i) => i.kind === "lead" || i.kind === "quote").length,
    scheduledTodayCount: 0, // Not supported by schema yet
  };
}
