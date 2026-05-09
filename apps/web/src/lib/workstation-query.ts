import {
  JobStatus,
  JobTaskStatus,
  LeadStatus,
  QuoteStatus,
  JobIssueSeverity,
  JobIssueStatus,
  JobPaymentRequirementStatus,
  DailyJobLogStatus,
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
  | "investigate"
  | "daily-log";

export type WorkstationWorkItemPriority = "critical" | "high" | "medium" | "low";

export type WorkstationWorkItemGroup =
  | "investigate"
  | "ready"
  | "active"
  | "waiting"
  | "scheduled"
  | "blocked";

export type WorkstationLens =
  | "attention"
  | "today"
  | "waiting"
  | "upcoming"
  | "all";

export type WorkstationFilterCategory =
  | "all"
  | "leads"
  | "quotes"
  | "jobs"
  | "tasks"
  | "issues"
  | "payments"
  | "logs";

export type WorkstationWorkItem = {
  id: string;
  kind: WorkstationWorkItemKind;
  title: string;
  subtitle?: string;
  status?: string;
  priority: WorkstationWorkItemPriority;
  group: WorkstationWorkItemGroup;
  lens: WorkstationLens;
  filterCategory: WorkstationFilterCategory;
  reason: string;
  nextStep: string;
  recordId: string;
  parentRecordId?: string;
  parentLabel?: string;
  href?: string;
  updatedAt: Date;
  isBlocked?: boolean;
  /** Shared readiness / checklist model for Workstation + full-record alignment. */
  workflow?: WorkItemEmbeddedWorkflow;
};

export type WorkstationSummary = {
  investigateCount: number;
  activeJobsCount: number;
  openTasksCount: number;
  openLeadsQuotesCount: number;
  scheduledTodayCount: number;
  dailyLogsToReviewCount: number;
};

function lanesForQuoteWorkflow(
  readinessState: ReturnType<typeof getQuoteReadiness>["state"],
  workflow: WorkItemEmbeddedWorkflow,
  base: { group: WorkstationWorkItemGroup; priority: WorkstationWorkItemPriority },
): { group: WorkstationWorkItemGroup; priority: WorkstationWorkItemPriority; lens: WorkstationLens } {
  if (readinessState === "SENT_AWAITING_CUSTOMER") {
    return { group: "waiting", priority: "low", lens: "waiting" };
  }
  if (readinessState === "APPROVED_READY_TO_ACTIVATE") {
    return { group: "ready", priority: "high", lens: "attention" };
  }
  if (readinessState === "APPROVED_NEEDS_EXECUTION_REVIEW") {
    return { group: "investigate", priority: "high", lens: "attention" };
  }
  if (workflow.priority === "blocking") {
    return { group: "investigate", priority: "high", lens: "attention" };
  }
  if (workflow.priority === "critical") {
    return { group: "ready", priority: "high", lens: "attention" };
  }
  if (workflow.priority === "watching") {
    return { group: "waiting", priority: "low", lens: "waiting" };
  }
  
  const lens: WorkstationLens = base.priority === "high" || base.priority === "critical" ? "attention" : "today";
  return { ...base, lens };
}

function lanesForLeadWorkflow(
  workflow: WorkItemEmbeddedWorkflow,
  isUnlinked: boolean,
): { group: WorkstationWorkItemGroup; priority: WorkstationWorkItemPriority; lens: WorkstationLens } {
  if (workflow.priority === "blocking") {
    return { group: "investigate", priority: "high", lens: "attention" };
  }
  if (workflow.priority === "critical") {
    return { group: "ready", priority: "high", lens: "attention" };
  }
  if (workflow.priority === "watching") {
    return { group: "waiting", priority: "low", lens: "waiting" };
  }
  if (workflow.priority === "satisfied") {
    return { group: "ready", priority: "low", lens: "today" };
  }
  if (isUnlinked) {
    if (workflow.priority === "actionable" && workflow.canCompleteInWorkstation) {
      return { group: "ready", priority: "medium", lens: "today" };
    }
    return { group: "investigate", priority: "high", lens: "attention" };
  }
  return { group: "ready", priority: "medium", lens: "today" };
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

    const { group, priority, lens } = lanesForLeadWorkflow(workflow, isUnlinked);

    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      status: lead.status,
      priority,
      group,
      lens,
      filterCategory: "leads",
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

    const { group, priority, lens } = lanesForQuoteWorkflow(readiness.state, workflow, {
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
      lens,
      filterCategory: "quotes",
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
      issues: {
        where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
      },
      paymentRequirements: {
        where: { status: JobPaymentRequirementStatus.DUE },
      },
    },
  });

  for (const job of jobs) {
    const isJobBlocked = job.issues.length > 0 || job.paymentRequirements.length > 0;

    for (const task of job.tasks) {
      const primaryJobIdentity = job.lead?.title || job.customer?.displayName || job.title;
      const secondaryJobIdentity = job.title !== primaryJobIdentity ? job.title : null;

      const priority = task.status === JobTaskStatus.IN_PROGRESS ? "high" : "medium";
      const lens: WorkstationLens = priority === "high" ? "attention" : "today";

      items.push({
        id: `task-${task.id}`,
        kind: "task",
        title: task.title,
        subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""} · ${task.jobStage.title}`,
        status: task.status,
        priority,
        group: "active",
        lens,
        filterCategory: "tasks",
        reason: task.status === JobTaskStatus.IN_PROGRESS ? "Task is currently in progress." : "Task is ready to start.",
        nextStep: task.status === JobTaskStatus.IN_PROGRESS ? "Complete the task." : "Start the task.",
        recordId: task.id,
        parentRecordId: job.id,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: task.updatedAt,
        isBlocked: isJobBlocked,
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
        lens: "attention",
        filterCategory: "jobs",
        reason: "Active job has no remaining TODO or IN_PROGRESS tasks.",
        nextStep: "Review job completion or add tasks.",
        recordId: job.id,
        parentRecordId: job.customerId || job.leadId || undefined,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: job.updatedAt,
        isBlocked: isJobBlocked,
      });
    }
  }

  // 4. Job Issues (Blocking)
  const issues = await db.jobIssue.findMany({
    where: {
      organizationId,
      status: JobIssueStatus.OPEN,
      severity: JobIssueSeverity.BLOCKS_WORK,
    },
    include: {
      job: {
        include: {
          customer: true,
          lead: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  for (const issue of issues) {
    const primaryJobIdentity = issue.job.lead?.title || issue.job.customer?.displayName || issue.job.title;
    const secondaryJobIdentity = issue.job.title !== primaryJobIdentity ? issue.job.title : null;

    items.push({
      id: `issue-${issue.id}`,
      kind: "investigate",
      title: issue.title,
      subtitle: `Issue: ${issue.type.replace(/_/g, " ")} · ${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""}`,
      status: issue.status,
      priority: "high",
      group: "investigate",
      lens: "attention",
      filterCategory: "issues",
      reason: issue.description || "Blocking issue needs resolution.",
      nextStep: "Review and resolve issue.",
      recordId: issue.id,
      parentRecordId: issue.jobId,
      parentLabel: primaryJobIdentity,
      href: `/jobs/${issue.jobId}`,
      updatedAt: issue.updatedAt,
    });
  }

  // 5. Job Payment Requirements (Due)
  const duePayments = await db.jobPaymentRequirement.findMany({
    where: {
      organizationId,
      status: JobPaymentRequirementStatus.DUE,
    },
    include: {
      job: {
        include: {
          customer: true,
          lead: true,
        },
      },
      requiredBeforeStage: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  for (const payment of duePayments) {
    const primaryJobIdentity = payment.job.lead?.title || payment.job.customer?.displayName || payment.job.title;
    const secondaryJobIdentity = payment.job.title !== primaryJobIdentity ? payment.job.title : null;

    const amountLabel = payment.amountCents
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
          payment.amountCents / 100,
        )
      : null;

    items.push({
      id: `payment-${payment.id}`,
      kind: "investigate",
      title: payment.title,
      subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""}${amountLabel ? ` · ${amountLabel}` : ""}`,
      status: payment.status,
      priority: "high",
      group: "investigate",
      lens: "attention",
      filterCategory: "payments",
      reason: payment.requiredBeforeStage
        ? `Payment required before ${payment.requiredBeforeStage.title}.`
        : "Payment is due.",
      nextStep: "Record payment or waive requirement.",
      recordId: payment.id,
      parentRecordId: payment.jobId,
      parentLabel: primaryJobIdentity,
      href: `/jobs/${payment.jobId}`,
      updatedAt: payment.updatedAt,
    });
  }

  // 6. Daily Job Logs (Needing Review)
  const draftLogs = await db.dailyJobLog.findMany({
    where: {
      organizationId,
      status: DailyJobLogStatus.DRAFT,
    },
    include: {
      job: {
        include: {
          customer: true,
          lead: true,
        },
      },
    },
    orderBy: { logDate: "desc" },
    take: 50,
  });

  for (const log of draftLogs) {
    const primaryJobIdentity = log.job.lead?.title || log.job.customer?.displayName || log.job.title;
    const secondaryJobIdentity = log.job.title !== primaryJobIdentity ? log.job.title : null;

    items.push({
      id: `log-${log.id}`,
      kind: "daily-log",
      title: `Daily Log: ${log.logDate.toLocaleDateString()}`,
      subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""}`,
      status: log.status,
      priority: "medium",
      group: "investigate",
      lens: "attention",
      filterCategory: "logs",
      reason: "Daily log needs review and approval.",
      nextStep: "Review and approve log.",
      recordId: log.id,
      parentRecordId: log.jobId,
      parentLabel: primaryJobIdentity,
      href: `/jobs/${log.jobId}`, // No popup for now, link to job
      updatedAt: log.updatedAt,
    });
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
    dailyLogsToReviewCount: items.filter((i) => i.kind === "daily-log").length,
  };
}
