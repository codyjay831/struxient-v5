import {
  JobStatus,
  JobTaskStatus,
  LeadStatus,
  QuoteStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { getLeadCommercialProgress } from "@/lib/lead-commercial-progress";
import {
  buildLeadRecordActionState,
  buildQuoteRecordActionState,
  toEmbeddedWorkflow,
  type WorkItemEmbeddedWorkflow,
} from "@/lib/record-workflow-surface";

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
  /** Shared readiness / checklist model for Workstation + full-record alignment. */
  workflow?: WorkItemEmbeddedWorkflow;
};

export type WorkstationSummary = {
  investigateCount: number;
  activeJobsCount: number;
  openTasksCount: number;
  openLeadsQuotesCount: number;
  scheduledTodayCount: number;
};

function lanesForQuoteWorkflow(
  readinessState: ReturnType<typeof getQuoteReadiness>["state"],
  workflow: WorkItemEmbeddedWorkflow,
  base: { group: WorkstationWorkItemGroup; priority: WorkstationWorkItemPriority },
): { group: WorkstationWorkItemGroup; priority: WorkstationWorkItemPriority } {
  if (readinessState === "SENT_AWAITING_CUSTOMER") {
    return { group: "waiting", priority: "low" };
  }
  if (readinessState === "APPROVED_READY_TO_ACTIVATE") {
    return { group: "ready", priority: "high" };
  }
  if (readinessState === "APPROVED_NEEDS_EXECUTION_REVIEW") {
    return { group: "investigate", priority: "high" };
  }
  if (workflow.priority === "blocking") {
    return { group: "investigate", priority: "high" };
  }
  if (workflow.priority === "critical") {
    return { group: "ready", priority: "high" };
  }
  if (workflow.priority === "watching") {
    return { group: "waiting", priority: "low" };
  }
  return base;
}

function lanesForLeadWorkflow(
  workflow: WorkItemEmbeddedWorkflow,
  isUnlinked: boolean,
): { group: WorkstationWorkItemGroup; priority: WorkstationWorkItemPriority } {
  if (workflow.priority === "blocking") {
    return { group: "investigate", priority: "high" };
  }
  if (workflow.priority === "critical") {
    return { group: "ready", priority: "high" };
  }
  if (workflow.priority === "watching") {
    return { group: "waiting", priority: "low" };
  }
  if (workflow.priority === "satisfied") {
    return { group: "ready", priority: "low" };
  }
  if (isUnlinked) {
    if (workflow.priority === "actionable" && workflow.canCompleteInWorkstation) {
      return { group: "ready", priority: "medium" };
    }
    return { group: "investigate", priority: "high" };
  }
  return { group: "ready", priority: "medium" };
}

export function compareWorkstationSalesIntakeOrder(
  a: WorkstationWorkItem,
  b: WorkstationWorkItem,
): number {
  const rank = (p: WorkstationWorkItemPriority) =>
    p === "critical" ? 0 : p === "high" ? 1 : p === "medium" ? 2 : 3;
  const pr = rank(a.priority) - rank(b.priority);
  if (pr !== 0) return pr;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export async function queryWorkstationWorkItems(organizationId: string): Promise<WorkstationWorkItem[]> {
  const items: WorkstationWorkItem[] = [];

  // 1. Leads
  const leads = await db.lead.findMany({
    where: { organizationId, status: { in: [LeadStatus.OPEN, LeadStatus.QUALIFYING] } },
    include: {
      customer: true,
      quotes: {
        where: { status: { not: QuoteStatus.ARCHIVED } },
        include: {
          job: { select: { id: true, status: true } },
          _count: { select: { lineItems: true } },
        },
      },
    },
  });

  for (const lead of leads) {
    const isUnlinked = lead.customerId === null;
    const hasActiveQuote = lead.quotes.length > 0;

    if (hasActiveQuote && !isUnlinked) continue;

    const progress = getLeadCommercialProgress({
      lead: {
        status: lead.status,
        customerId: lead.customerId,
        email: lead.email,
        phone: lead.phone,
      },
      quotes: lead.quotes.map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        totalCents: q.totalCents,
        lineItemCount: q._count.lineItems,
        updatedAt: q.updatedAt,
        job: q.job,
      })),
    });

    const recordState = buildLeadRecordActionState({
      leadId: lead.id,
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      progress,
    });
    const workflow = toEmbeddedWorkflow(recordState);

    const { group, priority } = lanesForLeadWorkflow(workflow, isUnlinked);

    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      status: lead.status,
      priority,
      group,
      reason: workflow.reason,
      nextStep: workflow.nextAction?.label ?? "Review in Leads.",
      recordId: lead.id,
      href: `/leads/${lead.id}`,
      updatedAt: lead.updatedAt,
      workflow,
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
        needsAttentionLineCount: activationReadiness.blockReasons.filter(
          (r) => r.code === "LINE_NEEDS_EXECUTION_REVIEW",
        ).length,
        anomalyLineCount: activationReadiness.blockReasons.filter(
          (r) => r.code === "LINE_COMMERCIAL_ONLY_HAS_TASKS",
        ).length,
      },
    });

    if (readiness.state === "JOB_ACTIVE" || readiness.state === "ARCHIVED") continue;

    const primaryIdentity = quote.lead?.title || quote.customer?.displayName || quote.title;
    const secondaryIdentity = quote.title !== primaryIdentity ? quote.title : null;

    const parentLabel = quote.customer?.displayName || quote.lead?.title || undefined;
    const subtitle = secondaryIdentity
      ? `Quote: ${secondaryIdentity}`
      : quote.customer?.displayName || undefined;

    const recordState = buildQuoteRecordActionState({
      quoteId: quote.id,
      title: primaryIdentity,
      subtitle,
      customerId: quote.customerId,
      leadId: quote.leadId,
      readiness,
    });
    const workflow = toEmbeddedWorkflow(recordState);

    const { group, priority } = lanesForQuoteWorkflow(readiness.state, workflow, {
      group: "ready",
      priority: "medium",
    });

    items.push({
      id: `quote-${quote.id}`,
      kind: "quote",
      title: primaryIdentity,
      subtitle,
      status: quote.status,
      priority,
      group,
      reason: workflow.reason,
      nextStep: workflow.nextAction?.label || "Review quote.",
      recordId: quote.id,
      parentRecordId: quote.customerId || quote.leadId || undefined,
      parentLabel,
      href: quote.leadId ? `/leads/${quote.leadId}` : `/quotes/${quote.id}`,
      updatedAt: quote.updatedAt,
      workflow,
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
        href: `/jobs/${job.id}`,
        updatedAt: task.updatedAt,
      });
    }

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
    activeJobsCount: new Set(
      items.filter((i) => i.kind === "job" || i.kind === "task").map((i) => i.parentRecordId || i.recordId),
    ).size,
    openTasksCount: items.filter((i) => i.kind === "task").length,
    openLeadsQuotesCount: items.filter((i) => i.kind === "lead" || i.kind === "quote").length,
    scheduledTodayCount: 0,
  };
}
