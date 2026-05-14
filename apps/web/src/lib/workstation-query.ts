import {
  JobStatus,
  LeadStatus,
  QuoteStatus,
  JobIssueSeverity,
  JobIssueStatus,
  JobPaymentRequirementStatus,
  DailyJobLogStatus,
  JobVisitStatus,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
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
import { deriveTaskState, taskStateLabel } from "./task-readiness";
import { getLiveSignals } from "./signal-bus";

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
  missingSignals?: string[];
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

export function compareWorkstationLeadOrder(
  a: WorkstationWorkItem,
  b: WorkstationWorkItem,
): number {
  const rank = (p: WorkstationWorkItemPriority) =>
    p === "critical" ? 0 : p === "high" ? 1 : p === "medium" ? 2 : 3;
  const pr = rank(a.priority) - rank(b.priority);
  if (pr !== 0) return pr;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export async function queryWorkstationWorkItems(
  organizationId: string,
  urgentThresholdHours: number = 24
): Promise<WorkstationWorkItem[]> {
  const items: WorkstationWorkItem[] = [];
  const now = new Date();
  const urgentThreshold = new Date(now.getTime() - urgentThresholdHours * 60 * 60 * 1000);

  const pipelineStatuses = [LeadStatus.NEW, LeadStatus.TRIAGING];

  // 1. Leads
  const leads = await db.lead.findMany({
    where: { organizationId, status: { in: pipelineStatuses } },
    include: {
      customer: true,
      visitRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
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

    if (hasActiveQuote) continue;

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

    // Prioritize leads with pending visit requests
    const pendingVisit = lead.visitRequests[0];
    let effectivePriority = pendingVisit ? "critical" : priority;
    
    // Senior logic: items updated within the threshold are also high priority
    if (effectivePriority !== "critical" && lead.updatedAt > urgentThreshold) {
      effectivePriority = "high";
    }

    const effectiveGroup = pendingVisit ? "investigate" : group;
    const effectiveLens = pendingVisit ? "attention" : lens;
    const effectiveReason = pendingVisit 
      ? `Site visit requested for ${pendingVisit.requestedDate?.toLocaleDateString() ?? "anytime"}.`
      : workflow.reason;
    const effectiveNextStep = pendingVisit ? "Confirm or schedule visit." : (workflow.nextAction?.label ?? "Review in Leads.");

    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      status: lead.status,
      priority: effectivePriority as WorkstationWorkItemPriority,
      group: effectiveGroup,
      lens: effectiveLens,
      filterCategory: "leads",
      reason: effectiveReason,
      nextStep: effectiveNextStep,
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
      checkpoints: {
        where: { kind: QuoteCheckpointKind.APPROVAL },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      lineItems: {
        include: {
          draftExecutionTasks: true,
        },
      },
    },
  });

  for (const quote of quotes) {
    const latestApproval = quote.checkpoints[0];
    const isCustomerAccepted = latestApproval?.source === QuoteCheckpointSource.CUSTOMER_PORTAL;

    const activationReadiness = evaluateQuoteJobActivationReadiness({
      status: quote.status,
      lines: quote.lineItems.map((l) => ({
        id: l.id,
        description: l.description,
        tasks: l.draftExecutionTasks.map((t) => ({
          id: t.id,
          title: t.title,
          providesSignals: t.providesSignals,
          requiresSignals: t.requiresSignals,
          hardSignal: t.hardSignal,
        })),
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
          (r) => r.code === "HARD_SIGNAL_NO_PROVIDER",
        ).length,
        anomalyLineCount: activationReadiness.blockReasons.filter(
          (r) => r.code === "CIRCULAR_SIGNAL_DEPENDENCY",
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

    let effectivePriority = priority;
    // Senior logic: items updated within the threshold are also high priority
    if (effectivePriority !== "critical" && quote.updatedAt > urgentThreshold) {
      effectivePriority = "high";
    }

    items.push({
      id: `quote-${quote.id}`,
      kind: "quote",
      title: primaryIdentity,
      subtitle,
      status: quote.status,
      priority: effectivePriority as WorkstationWorkItemPriority,
      group,
      lens,
      filterCategory: "quotes",
      reason: isCustomerAccepted ? "Accepted by customer via portal." : workflow.reason,
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
        where: { completedAt: null },
        include: { 
          jobStage: {
            select: {
              id: true,
              title: true,
              sortOrder: true,
              requiresSignals: true,
            }
          },
          attachments: { 
            where: { status: "READY" },
            select: { id: true } 
          },
          issues: {
            where: { status: JobIssueStatus.OPEN },
            select: { status: true, severity: true },
          },
        },
      },
      issues: {
        where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
      },
      paymentRequirements: {
        where: {
          status: { in: [JobPaymentRequirementStatus.DUE, JobPaymentRequirementStatus.PENDING] },
        },
        include: {
          requiredBeforeStage: { select: { sortOrder: true } },
        },
      },
      visits: {
        where: { status: { in: [JobVisitStatus.SCHEDULED, JobVisitStatus.COMPLETED] } },
        orderBy: { scheduledStartAt: "desc" },
        take: 10,
      },
    },
  });

  for (const job of jobs) {
    const liveSignals = await getLiveSignals(job.id);
    const unpaidRequirements = job.paymentRequirements.filter(p => p.status === JobPaymentRequirementStatus.DUE);
    const isJobBlocked = job.issues.length > 0 || unpaidRequirements.length > 0;
    const primaryJobIdentity = job.lead?.title || job.customer?.displayName || job.title;
    const secondaryJobIdentity = job.title !== primaryJobIdentity ? job.title : null;

    // 3a. Scheduling Signals
    const now = new Date();
    const upcomingVisits = job.visits.filter(
      (v) => v.status === JobVisitStatus.SCHEDULED && v.scheduledStartAt > now
    );
    const missedVisits = job.visits.filter(
      (v) => v.status === JobVisitStatus.SCHEDULED && v.scheduledStartAt <= now
    );
    const hasFutureVisit = upcomingVisits.length > 0;

    for (const visit of missedVisits) {
      items.push({
        id: `visit-missed-${visit.id}`,
        kind: "schedule",
        title: `Missed Visit: ${visit.scheduledStartAt.toLocaleDateString()}`,
        subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""}`,
        status: "Missed",
        priority: "high",
        group: "investigate",
        lens: "attention",
        filterCategory: "jobs",
        reason: "Scheduled visit time has passed without completion.",
        nextStep: "Complete, reschedule, or cancel visit.",
        recordId: visit.id,
        parentRecordId: job.id,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: visit.updatedAt,
      });
    }

    for (const visit of upcomingVisits) {
      const isToday = visit.scheduledStartAt.toDateString() === now.toDateString();
      items.push({
        id: `visit-upcoming-${visit.id}`,
        kind: "schedule",
        title: `Visit: ${visit.scheduledStartAt.toLocaleDateString()}`,
        subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""}`,
        status: isToday ? "Today" : "Upcoming",
        priority: isToday ? "high" : "medium",
        group: isToday ? "active" : "scheduled",
        lens: isToday ? "today" : "upcoming",
        filterCategory: "jobs",
        reason: isToday ? "Visit scheduled for today." : "Upcoming scheduled visit.",
        nextStep: "Prepare for visit.",
        recordId: visit.id,
        parentRecordId: job.id,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: visit.updatedAt,
      });
    }

    // 3b. Payment Signals (surfaced as attention items)
    for (const payment of unpaidRequirements) {
      items.push({
        id: `payment-needed-${payment.id}`,
        kind: "job",
        title: `Payment Due: ${payment.title}`,
        subtitle: primaryJobIdentity,
        status: "Unpaid",
        priority: "high",
        group: "investigate",
        lens: "attention",
        filterCategory: "payments",
        reason: payment.requiredBeforeStageId ? "Payment required before next stage." : "Required payment is due.",
        nextStep: "Record payment or waive.",
        recordId: job.id,
        parentRecordId: job.customerId || job.leadId || undefined,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: payment.updatedAt,
      });
    }

    if (!hasFutureVisit && job.status === JobStatus.ACTIVE && !isJobBlocked) {
      // Only signal unscheduled if there are tasks to do
      const hasOpenTasks = job.tasks.length > 0;
      if (hasOpenTasks) {
        items.push({
          id: `job-unscheduled-${job.id}`,
          kind: "schedule",
          title: "Unscheduled Job",
          subtitle: primaryJobIdentity,
          status: "Needs Schedule",
          priority: "medium",
          group: "ready",
          lens: "today",
          filterCategory: "jobs",
          reason: "Active job with open tasks has no upcoming visits.",
          nextStep: "Schedule a job visit.",
          recordId: job.id,
          parentRecordId: job.customerId || job.leadId || undefined,
          parentLabel: primaryJobIdentity,
          href: `/jobs/${job.id}`,
          updatedAt: job.updatedAt,
        });
      }
    }

    const sortedTasks = [...job.tasks].sort((a, b) => {
      if (a.jobStage.sortOrder !== b.jobStage.sortOrder) {
        return a.jobStage.sortOrder - b.jobStage.sortOrder;
      }
      return a.sortOrder - b.sortOrder;
    });

    const primaryTaskId = sortedTasks[0]?.id;

    for (const task of sortedTasks) {
      const isPrimary = task.id === primaryTaskId;
      const primaryJobIdentity = job.lead?.title || job.customer?.displayName || job.title;
      const secondaryJobIdentity = job.title !== primaryJobIdentity ? job.title : null;

      const derivedState = deriveTaskState({
        status: task.status,
        completedAt: task.completedAt,
        completionNote: task.completionNote,
        completionRequirementsJson: task.completionRequirementsJson,
        attachments: task.attachments,
        requiresSignals: task.requiresSignals,
        issues: task.issues,
        stage: {
          requiresSignals: task.jobStage.requiresSignals,
          issues: [], // Job-level issues already check muted state
        },
      }, liveSignals);

      let priority: WorkstationWorkItemPriority = derivedState === "READY" ? "high" : "medium";

      // If not the primary task for this job, demote it so it doesn't take the XL card
      // while earlier work is incomplete.
      if (!isPrimary) {
        priority = "low";
      }

      const isBlocked = derivedState === "BLOCKED_BY_ISSUE" || derivedState === "BLOCKED_BY_SIGNAL";
      const lens: WorkstationLens = isBlocked ? "waiting" : priority === "high" ? "attention" : "today";
      const group: WorkstationWorkItemGroup = isBlocked ? "blocked" : "active";

      const missingSignals = task.requiresSignals.filter(s => !liveSignals.includes(s))
        .concat(task.jobStage.requiresSignals.filter(s => !liveSignals.includes(s)));

      items.push({
        id: `task-${task.id}`,
        kind: "task",
        title: task.title,
        subtitle: `${primaryJobIdentity}${secondaryJobIdentity ? ` (${secondaryJobIdentity})` : ""} · ${task.jobStage.title}`,
        status: taskStateLabel(derivedState),
        priority,
        group,
        lens,
        filterCategory: "tasks",
        reason: derivedState === "BLOCKED_BY_ISSUE" ? "Blocked by an open issue." :
                derivedState === "BLOCKED_BY_SIGNAL" ? `Waiting on signal: ${missingSignals.join(", ")}` :
                derivedState === "NEEDS_PROOF" ? "Task needs completion proof." :
                "Task is ready to complete.",
        nextStep: isBlocked ? "Resolve blocker." : "Complete the task.",
        recordId: task.id,
        parentRecordId: job.id,
        parentLabel: primaryJobIdentity,
        href: `/jobs/${job.id}`,
        updatedAt: task.updatedAt,
        isBlocked,
        missingSignals: missingSignals.length > 0 ? missingSignals : undefined,
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
    scheduledTodayCount: items.filter((i) => i.kind === "schedule" && i.status === "Today").length,
    dailyLogsToReviewCount: items.filter((i) => i.kind === "daily-log").length,
  };
}
