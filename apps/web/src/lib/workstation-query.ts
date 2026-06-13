import {
  JobStatus,
  LeadStatus,
  QuoteStatus,
  JobIssueSeverity,
  JobIssueStatus,
  JobScheduleEventStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
  JobPaymentRequirementStatus,
  DailyJobLogStatus,
  ChangeOrderStatus,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { getLeadCommercialProgress } from "@/lib/lead-commercial-progress";
import {
  jobsiteLineFromLead,
  isLeadAddressVerified,
  resolveJobsiteLineForQuoteOrJob,
} from "./jobsite-address";
import { resolveJobWorkContext } from "./work-item-context";
import {
  buildLeadRecordActionState,
  buildQuoteRecordActionState,
  toEmbeddedWorkflow,
  type WorkItemEmbeddedWorkflow,
} from "@/lib/record-workflow-surface";
import { deriveTaskState, taskStateLabel, toTaskReadinessInput } from "./task-readiness";
import {
  buildJobExecutionContextFromJob,
  deriveJobExecutionHealth,
  isJobExecutionBlockedForWorkstation,
  type ExecutionHealthPrimaryState,
} from "./job-execution-health";
import { getLiveSignals } from "./signal-bus";
import {
  attachScheduleAnchorsToRequirements,
  buildPaymentDueContextFromJob,
  getUnsettledEffectivelyDueRequirements,
  loadScheduleAnchorsByIds,
} from "./job-payment-readiness";
import { rank, WorkstationLane } from "./workstation/rank";
import {
  deriveBlockedTaskRecoveryRoute,
  deriveIssueRecoveryRoute,
  deriveStuckJobWorkstationRoute,
  isWorkstationRoutableHealthAction,
  mapHealthActionToWorkstationRoute,
  type WorkstationRecoveryActionKind,
} from "./workstation-recovery-routing";
import { includesEquivalentSignal } from "./signal-key";
import { deriveSchedulingAttentionOverride, mapLinkedEventsFromRows } from "./workstation-scheduling-attention";
import { pickPrimaryLinkedOpenTaskId } from "./workstation/schedule-event-task-routing";
import {
  deriveEventPotentiallyMissed,
  deriveEventUpcoming,
  deriveTaskOverdue,
  deriveTaskDueToday,
} from "./scheduling/scheduling-derivation";
import { getOrgTimezone } from "./scheduling/deadline-timezone";
import { queryJobsNeedingScheduleCleanupAttention } from "./scheduling/job-cancel-cleanup";
import { LEAD_PIPELINE_OPEN_STATUSES } from "./lead-display";
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
  /** Compact who/what/where for list cards (no workflow stage). */
  contextLine?: string;
  status?: string;
  priority: WorkstationWorkItemPriority;
  group: WorkstationWorkItemGroup;
  lens: WorkstationLens;
  lane: WorkstationLane;
  withinLaneRank: number;
  filterCategory: WorkstationFilterCategory;
  reason: string;
  nextStep: string;
  recordId: string;
  parentRecordId?: string;
  parentLabel?: string;
  href?: string;
  updatedAt: Date;
  /** Assignee user id (tasks only) — additive exposure for "my work" filtering. */
  assignedUserId?: string | null;
  /** Task deadline (tasks only) — additive exposure for time ordering. */
  dueAt?: Date | null;
  /** Task scheduled start (tasks only) — additive exposure for time ordering. */
  scheduledStartAt?: Date | null;
  /** True when blocked by an open issue — not when waiting on prerequisite signals. */
  isBlocked?: boolean;
  /** True when waiting on prerequisite task signals (normal pipeline, not an exception). */
  isWaitingOnSignals?: boolean;
  missingSignals?: string[];
  signalId?: string;
  /** Shared readiness / checklist model for Workstation + full-record alignment. */
  workflow?: WorkItemEmbeddedWorkflow;
  /** Derived job execution health (Slice 5). */
  executionHealthState?: ExecutionHealthPrimaryState;
  executionHealthHeadline?: string;
  /** Recovery routing (Slice 7A) — panel resolves via action* fields, not work item id. */
  actionKind?: WorkstationRecoveryActionKind;
  actionLabel?: string;
  actionIssueId?: string;
  actionTaskId?: string;
};

export type WorkstationSummary = {
  investigateCount: number;
  activeJobsCount: number;
  openTasksCount: number;
  openLeadsQuotesCount: number;
  scheduledTodayCount: number;
  dailyLogsToReviewCount: number;
};

function formatDependencyLabel(raw: string): string {
  if (/^[A-Z0-9]{12,}$/.test(raw)) {
    return "Required Prior Step";
  }
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

export async function queryWorkstationWorkItems(
  organizationId: string,
  role: StaffRole,
  urgentThresholdHours: number = 24
): Promise<WorkstationWorkItem[]> {
  const items: WorkstationWorkItem[] = [];
  const now = new Date();
  const urgentThreshold = new Date(now.getTime() - urgentThresholdHours * 60 * 60 * 1000);
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  const orgTimezone = getOrgTimezone(organization?.timezone);

  const knownLeadStatuses = new Set(Object.values(LeadStatus));
  const pipelineStatuses = LEAD_PIPELINE_OPEN_STATUSES.filter((s) =>
    knownLeadStatuses.has(s),
  );

  // 1. Opportunities
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
    const hasActiveQuote = lead.quotes.length > 0;

    if (hasActiveQuote) continue;

    const progress = getLeadCommercialProgress({
      lead: {
        status: lead.status,
        followUpAt: lead.followUpAt,
        customerId: lead.customerId,
        contactName: lead.contactName,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        jobsiteAddressLine: jobsiteLineFromLead(lead),
        isAddressVerified: isLeadAddressVerified(lead),
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

    // Prioritize opportunities with pending visit requests
    const pendingVisit = lead.visitRequests[0];
    
    let priority: WorkstationWorkItemPriority = "medium";
    if (workflow.priority === "blocking" || pendingVisit) {
      priority = "critical";
    } else if (workflow.priority === "critical" || lead.updatedAt > urgentThreshold) {
      priority = "high";
    } else if (workflow.priority === "watching") {
      priority = "low";
    }

    const group: WorkstationWorkItemGroup = pendingVisit ? "investigate" : 
      (workflow.priority === "blocking" ? "investigate" : "ready");

    const { lane, withinLaneRank, reason: rankReason } = rank({
      kind: "lead",
      priority,
      group,
      updatedAt: lead.updatedAt,
    }, role, now);

    const effectiveReason = pendingVisit 
      ? `Site visit requested for ${pendingVisit.requestedDate?.toLocaleDateString() ?? "anytime"}.`
      : (rankReason || workflow.reason);
    const effectiveNextStep = pendingVisit ? "Confirm or schedule visit." : (workflow.nextAction?.label ?? "Review in Sales.");

    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      status: lead.status,
      priority,
      group,
      lens: "attention",
      lane,
      withinLaneRank,
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
      paymentSchedule: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          amountCents: true,
          percentage: true,
          anchorType: true,
        },
      },
    },
  });

  for (const quote of quotes) {
    const latestApproval = quote.checkpoints[0];
    const isCustomerAccepted = latestApproval?.source === QuoteCheckpointSource.CUSTOMER_PORTAL;

    const activationReadiness = evaluateQuoteJobActivationReadiness({
      status: quote.status,
      hasApprovalCheckpoint: quote.checkpoints.length > 0,
      lines: quote.lineItems.map((l) => ({
        id: l.id,
        description: l.description,
        tasks: l.draftExecutionTasks.map((t) => ({
          id: t.id,
          title: t.title,
          stageId: t.stageId,
          providesSignals: t.providesSignals,
          requiresSignals: t.requiresSignals,
          hardSignal: t.hardSignal,
        })),
      })),
      quoteTotalCents: quote.totalCents,
      paymentSchedule: quote.paymentSchedule.map((item) => ({
        id: item.id,
        title: item.title,
        anchorType: item.anchorType,
        amountCents: item.amountCents,
        percentage: item.percentage,
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

    let priority: WorkstationWorkItemPriority = "medium";
    if (workflow.priority === "blocking" || readiness.state === "APPROVED_READY_TO_ACTIVATE") {
      priority = "critical";
    } else if (workflow.priority === "critical" || quote.updatedAt > urgentThreshold) {
      priority = "high";
    } else if (workflow.priority === "watching") {
      priority = "low";
    }

    const group: WorkstationWorkItemGroup = (workflow.priority === "blocking" || readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW") 
      ? "investigate" : "ready";

    const { lane, withinLaneRank, reason: rankReason } = rank({
      kind: "quote",
      priority,
      group,
      updatedAt: quote.updatedAt,
    }, role, now);

    items.push({
      id: `quote-${quote.id}`,
      kind: "quote",
      title: primaryIdentity,
      subtitle,
      status: quote.status,
      priority,
      group,
      lens: "attention",
      lane,
      withinLaneRank,
      filterCategory: "quotes",
      reason: isCustomerAccepted ? "Accepted by customer via portal." : (rankReason || workflow.reason),
      nextStep: workflow.nextAction?.label || "Review quote.",
      recordId: quote.id,
      parentRecordId: quote.customerId || quote.leadId || undefined,
      parentLabel,
      href: quote.leadId ? `/leads/${quote.leadId}` : `/quotes/${quote.id}`,
      updatedAt: quote.updatedAt,
      workflow,
    });
  }

  // 2b. Change Orders
  const changeOrders = await db.changeOrder.findMany({
    where: {
      organizationId,
      status: {
        in: [ChangeOrderStatus.DRAFT, ChangeOrderStatus.SENT, ChangeOrderStatus.ACCEPTED],
      },
    },
    include: {
      quote: {
        select: {
          id: true,
          title: true,
          customerId: true,
          leadId: true,
          customer: { select: { displayName: true } },
          lead: { select: { title: true } },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  for (const changeOrder of changeOrders) {
    const priority: WorkstationWorkItemPriority =
      changeOrder.status === ChangeOrderStatus.ACCEPTED ? "critical" : "high";
    const group: WorkstationWorkItemGroup =
      changeOrder.status === ChangeOrderStatus.ACCEPTED ? "ready" : "waiting";
    const nextStep =
      changeOrder.status === ChangeOrderStatus.DRAFT
        ? "Send Change Order to customer."
        : changeOrder.status === ChangeOrderStatus.SENT
          ? "Await customer acceptance."
          : "Apply accepted Change Order.";

    const { lane, withinLaneRank, reason: rankReason } = rank(
      {
        kind: "quote",
        priority,
        group,
        updatedAt: changeOrder.updatedAt,
      },
      role,
      now,
    );

    const customerLabel = changeOrder.quote.customer?.displayName ?? changeOrder.quote.lead?.title ?? null;

    items.push({
      id: `change-order-${changeOrder.id}`,
      kind: "quote",
      title: `CO-${String(changeOrder.number).padStart(3, "0")} · ${changeOrder.title}`,
      subtitle: customerLabel ?? changeOrder.job.title,
      status: `Change Order ${changeOrder.status}`,
      priority,
      group,
      lens: changeOrder.status === ChangeOrderStatus.ACCEPTED ? "attention" : "waiting",
      lane,
      withinLaneRank,
      filterCategory: "quotes",
      reason: rankReason || "Customer-facing scope and price amendment in progress.",
      nextStep,
      recordId: changeOrder.id,
      parentRecordId: changeOrder.job.id,
      parentLabel: customerLabel ?? undefined,
      href: `/jobs/${changeOrder.job.id}/change-orders?focus=${changeOrder.id}`,
      updatedAt: changeOrder.updatedAt,
    });
  }

  // 3. Jobs & Tasks
  const jobs = await db.job.findMany({
    where: { organizationId, status: JobStatus.ACTIVE },
    include: {
      serviceLocation: {
        select: { id: true, organizationId: true, formattedAddress: true, addressLine1: true },
      },
      customer: {
        select: {
          id: true,
          displayName: true,
          organizationId: true,
          serviceLocations: {
            orderBy: { isPrimary: "desc" },
            select: { formattedAddress: true, addressLine1: true, isPrimary: true },
          },
        },
      },
      lead: true,
      tasks: {
        where: { completedAt: null },
        select: {
          id: true,
          title: true,
          category: true,
          updatedAt: true,
          dueAt: true,
          dueMode: true,
          dueGranularity: true,
          schedulingRequirement: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          scheduleEventLinks: {
            select: {
              jobScheduleEvent: {
                select: {
                  id: true,
                  status: true,
                  startAt: true,
                  endAt: true,
                },
              },
            },
          },
          assignedUserId: true,
          sortOrder: true,
          status: true,
          completedAt: true,
          completionNote: true,
          completionRequirementsJson: true,
          requiresSignals: true,
          recoveryFlowId: true,
          recoveryFlowOrder: true,
          jobStage: {
            select: {
              id: true,
              title: true,
              sortOrder: true,
            },
          },
          attachments: {
            where: { status: "READY" },
            select: { id: true },
          },
          assignedUser: {
            select: { id: true, name: true, email: true },
          },
          issues: {
            where: { status: JobIssueStatus.OPEN },
            select: { id: true, status: true, severity: true },
          },
          recoveryFlow: {
            select: { jobIssueId: true },
          },
        },
      },
      issues: {
        where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
        select: {
          id: true,
          title: true,
          status: true,
          severity: true,
          jobStageId: true,
          jobTaskId: true,
          createdAt: true,
          recoveryFlow: {
            select: {
              id: true,
              status: true,
              tasks: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  recoveryFlowOrder: true,
                },
                orderBy: { recoveryFlowOrder: "asc" },
              },
            },
          },
        },
      },
      paymentRequirements: {
        where: {
          status: { in: [JobPaymentRequirementStatus.DUE, JobPaymentRequirementStatus.PENDING] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          updatedAt: true,
          requiredBeforeStageId: true,
          sourcePaymentScheduleItemId: true,
        },
      },
      stages: {
        select: {
          id: true,
          sortOrder: true,
          stageId: true,
          title: true,
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            select: { id: true, status: true, severity: true },
          },
          tasks: {
            select: { status: true, recoveryFlowId: true },
          },
        },
      },
      scheduleEvents: {
        where: {
          status: {
            in: [
              JobScheduleEventStatus.TENTATIVE,
              JobScheduleEventStatus.CONFIRMED,
              JobScheduleEventStatus.COMPLETED,
            ],
          },
        },
        orderBy: { startAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          startAt: true,
          endAt: true,
          title: true,
          updatedAt: true,
          taskLinks: {
            select: {
              jobTask: {
                select: { id: true, completedAt: true, status: true },
              },
            },
          },
        },
      },
    },
  });

  const jobPaymentScheduleAnchors = await loadScheduleAnchorsByIds(
    jobs.flatMap((job) => job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId)),
  );

  for (const job of jobs) {
    const liveSignals = await getLiveSignals(job.id);
    const enrichedPaymentRequirements = attachScheduleAnchorsToRequirements(
      job.paymentRequirements,
      jobPaymentScheduleAnchors,
    );
    const jobsiteLine = resolveJobsiteLineForQuoteOrJob({
      serviceLocation:
        job.serviceLocation && job.serviceLocation.organizationId === organizationId
          ? {
              formattedAddress: job.serviceLocation.formattedAddress,
              addressLine1: job.serviceLocation.addressLine1,
            }
          : null,
      customerLocations: job.customer?.serviceLocations ?? [],
      leadRow: job.lead
        ? { address: job.lead.address, signals: job.lead.signals }
        : null,
    });
    const {
      customerName: jobCustomerName,
      scopeLabel: jobScopeLabel,
      contextLine: jobContextLine,
      parentLabel: jobParentLabel,
    } = resolveJobWorkContext({
      jobTitle: job.title,
      customer: job.customer,
      lead: job.lead,
      jobsiteLine,
    });
    const jobCardTitle = jobScopeLabel || jobCustomerName || job.title;

    const stagesForHealth = job.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      sortOrder: stage.sortOrder,
      stageId: stage.stageId,
      issues: stage.issues,
      tasks: job.tasks
        .filter((t) => t.jobStage.id === stage.id)
        .map((t) => ({
          id: t.id,
          status: t.status,
          completedAt: t.completedAt,
          completionNote: t.completionNote,
          completionRequirementsJson: t.completionRequirementsJson,
          attachments: t.attachments,
          requiresSignals: t.requiresSignals,
          recoveryFlowId: t.recoveryFlowId,
          recoveryFlow: t.recoveryFlow,
          sortOrder: t.sortOrder,
          recoveryFlowOrder: t.recoveryFlowOrder,
          issues: t.issues,
        })),
    }));

    const executionHealth = deriveJobExecutionHealth(
      buildJobExecutionContextFromJob(
        {
          id: job.id,
          status: job.status,
          stages: stagesForHealth,
          issues: job.issues.map((i) => ({
            id: i.id,
            title: i.title,
            status: i.status,
            severity: i.severity,
            recoveryFlow: i.recoveryFlow,
          })),
          paymentRequirements: enrichedPaymentRequirements,
        },
        liveSignals,
      ),
    );
    const isJobExecutionBlocked = isJobExecutionBlockedForWorkstation(executionHealth);

    const healthWarningStates: ExecutionHealthPrimaryState[] = [
      "NO_NEXT_ACTION",
      "STALE_RECOVERY_FLOW",
      "BROKEN_REFERENCE",
    ];
    const blockingIssueCandidates = job.issues.map((i) => ({
      id: i.id,
      jobTaskId: i.jobTaskId,
      jobStageId: i.jobStageId,
      createdAt: i.createdAt,
      status: i.status,
      severity: i.severity,
      recoveryFlow: i.recoveryFlow
        ? {
            status: i.recoveryFlow.status,
            tasks: i.recoveryFlow.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              recoveryFlowOrder: t.recoveryFlowOrder,
            })),
          }
        : null,
    }));

    const stageIssuesByJobStageId = new Map<
      string,
      { id: string; status: JobIssueStatus; severity: JobIssueSeverity }[]
    >();
    for (const stage of job.stages) {
      stageIssuesByJobStageId.set(stage.id, [...stage.issues]);
    }
    for (const issue of job.issues) {
      if (!issue.jobStageId) continue;
      const list = stageIssuesByJobStageId.get(issue.jobStageId) ?? [];
      if (!list.some((i) => i.id === issue.id)) {
        list.push({ id: issue.id, status: issue.status, severity: issue.severity });
        stageIssuesByJobStageId.set(issue.jobStageId, list);
      }
    }

    const sortedTasks = [...job.tasks].sort((a, b) => {
      if (a.jobStage.sortOrder !== b.jobStage.sortOrder) {
        return a.jobStage.sortOrder - b.jobStage.sortOrder;
      }
      return a.sortOrder - b.sortOrder;
    });

    const stuckJobTaskStates = sortedTasks.map((task) => {
      const { jobStage, recoveryFlow, ...readinessTask } = task;
      const readinessInput = toTaskReadinessInput(readinessTask, {
        requiresSignals: [],
        issues: stageIssuesByJobStageId.get(jobStage.id) ?? [],
      });
      const derivedState = deriveTaskState(readinessInput, liveSignals, {
        recoveryFlowIssueId: recoveryFlow?.jobIssueId,
      });
      return {
        id: task.id,
        title: task.title,
        jobStageId: jobStage.id,
        completedAt: task.completedAt,
        derivedState,
      };
    });

    if (
      healthWarningStates.includes(executionHealth.primaryState) ||
      !executionHealth.invariantSatisfied
    ) {
      const recoveryIssueId =
        executionHealth.blockers.find((b) => b.kind === "recovery")?.entityId ??
        executionHealth.blockers.find((b) => b.kind === "issue")?.entityId;
      const healthRoute =
        (isWorkstationRoutableHealthAction(executionHealth.recommendedNextAction.type)
          ? mapHealthActionToWorkstationRoute(
              executionHealth.recommendedNextAction,
              recoveryIssueId,
            )
          : null) ??
        deriveStuckJobWorkstationRoute(stuckJobTaskStates, blockingIssueCandidates);

      const { lane, withinLaneRank } = rank(
        {
          kind: "investigate",
          priority: "critical",
          group: "investigate",
          updatedAt: job.updatedAt,
        },
        role,
        now,
      );

      items.push({
        id: `job-health-${job.id}`,
        kind: "investigate",
        title: executionHealth.headline,
        subtitle: jobCardTitle,
        status: executionHealth.primaryState,
        priority: "critical",
        group: "investigate",
        lens: "attention",
        lane,
        withinLaneRank,
        filterCategory: "jobs",
        reason: executionHealth.detail,
        nextStep: healthRoute?.nextStep ?? executionHealth.recommendedNextAction.label,
        recordId: job.id,
        parentRecordId: job.customerId || job.leadId || undefined,
        parentLabel: jobParentLabel ?? undefined,
        contextLine: jobContextLine ?? undefined,
        href: `/jobs/${job.id}`,
        updatedAt: job.updatedAt,
        executionHealthState: executionHealth.primaryState,
        executionHealthHeadline: executionHealth.headline,
        actionKind: healthRoute?.actionKind,
        actionLabel: healthRoute?.actionLabel,
        actionIssueId: healthRoute?.actionIssueId,
        actionTaskId: healthRoute?.actionTaskId,
      });
    }

    // 3a. Scheduling signals (canonical commitments)
    const upcomingCommitments = job.scheduleEvents.filter((event) =>
      deriveEventUpcoming(
        { status: event.status, startAt: event.startAt, endAt: event.endAt },
        now,
      ),
    );
    const potentiallyMissedCommitments = job.scheduleEvents.filter((event) =>
      deriveEventPotentiallyMissed(
        { status: event.status, startAt: event.startAt, endAt: event.endAt },
        now,
      ),
    );
    for (const event of potentiallyMissedCommitments) {
      const linkedTaskId = pickPrimaryLinkedOpenTaskId(event.taskLinks);
      const { lane, withinLaneRank } = rank({
        kind: "schedule",
        priority: "high",
        group: "investigate",
        updatedAt: event.updatedAt,
      }, role, now);

      items.push({
        id: `schedule-event-missed-${event.id}`,
        kind: "schedule",
        title: event.title?.trim() || "Potentially missed commitment",
        subtitle: jobCardTitle,
        status: "Missed",
        priority: "high",
        group: "investigate",
        lens: "attention",
        lane,
        withinLaneRank,
        filterCategory: "jobs",
        reason: "Confirmed commitment has ended and may require follow-up.",
        nextStep: "Review event outcome and schedule return work if needed.",
        recordId: event.id,
        parentRecordId: job.id,
        parentLabel: jobParentLabel ?? undefined,
        contextLine: jobContextLine ?? undefined,
        href: `/jobs/${job.id}`,
        updatedAt: event.updatedAt,
        ...(linkedTaskId ? { actionTaskId: linkedTaskId } : {}),
      });
    }

    for (const event of upcomingCommitments) {
      const linkedTaskId = pickPrimaryLinkedOpenTaskId(event.taskLinks);
      const isToday = event.startAt.toDateString() === now.toDateString();
      const priority: WorkstationWorkItemPriority = isToday ? "high" : "medium";
      const group: WorkstationWorkItemGroup = isToday ? "active" : "scheduled";

      const { lane, withinLaneRank } = rank({
        kind: "schedule",
        priority,
        group,
        updatedAt: event.updatedAt,
      }, role, now);

      items.push({
        id: `schedule-event-upcoming-${event.id}`,
        kind: "schedule",
        title: event.title?.trim() || "Upcoming commitment",
        subtitle: jobCardTitle,
        status: isToday ? "Today" : "Upcoming",
        priority,
        group,
        lens: isToday ? "today" : "upcoming",
        lane,
        withinLaneRank,
        filterCategory: "jobs",
        reason: isToday ? "Commitment scheduled for today." : "Upcoming scheduled commitment.",
        nextStep: "Confirm readiness and assignment before start.",
        recordId: event.id,
        parentRecordId: job.id,
        parentLabel: jobParentLabel ?? undefined,
        contextLine: jobContextLine ?? undefined,
        href: `/jobs/${job.id}`,
        updatedAt: event.updatedAt,
        ...(linkedTaskId ? { actionTaskId: linkedTaskId } : {}),
      });
    }

    const primaryTaskId = sortedTasks[0]?.id;

    for (const task of sortedTasks) {
      const isPrimary = task.id === primaryTaskId;

      const { jobStage, recoveryFlow, ...readinessTask } = task;
      const readinessInput = toTaskReadinessInput(readinessTask, {
        requiresSignals: [],
        issues: stageIssuesByJobStageId.get(jobStage.id) ?? [],
      });
      const derivedState = deriveTaskState(readinessInput, liveSignals, {
        recoveryFlowIssueId: recoveryFlow?.jobIssueId,
      });

      let priority: WorkstationWorkItemPriority = derivedState === "READY" ? "high" : "medium";

      // If not the primary task for this job, demote it so it doesn't take the XL card
      // while earlier work is incomplete.
      if (!isPrimary) {
        priority = "low";
      }

      const linkedEvents = mapLinkedEventsFromRows(task.scheduleEventLinks ?? []);
      const isBlockedByIssue = derivedState === "BLOCKED_BY_ISSUE";
      const isWaitingOnSignals = derivedState === "BLOCKED_BY_SIGNAL";
      const taskIsOverdue = deriveTaskOverdue(
        { dueAt: task.dueAt, dueMode: task.dueMode, dueGranularity: task.dueGranularity },
        orgTimezone,
        now,
      );
      const taskIsDueToday = deriveTaskDueToday(
        { dueAt: task.dueAt, dueMode: task.dueMode, dueGranularity: task.dueGranularity },
        orgTimezone,
        now,
      );
      const taskIsScheduledSoon = linkedEvents.some(
        (event) =>
          event.endAt > now &&
          (event.status === "CONFIRMED" || event.status === "TENTATIVE"),
      );
      const schedulingAttentionOverride = deriveSchedulingAttentionOverride({
        derivedState,
        schedulingRequirement: task.schedulingRequirement,
        linkedEvents,
        dueMode: task.dueMode,
        dueAt: task.dueAt,
      });

      if (taskIsOverdue && !isBlockedByIssue && !isWaitingOnSignals) {
        priority = "critical";
      } else if (taskIsDueToday && !isBlockedByIssue && !isWaitingOnSignals) {
        priority = "high";
      }
      if (schedulingAttentionOverride) {
        priority = schedulingAttentionOverride.priority;
      }

      let group: WorkstationWorkItemGroup = isBlockedByIssue
        ? "blocked"
        : isWaitingOnSignals
          ? "waiting"
          : taskIsScheduledSoon
            ? "scheduled"
            : "active";
      if (schedulingAttentionOverride) {
        group = schedulingAttentionOverride.group;
      }

      const { lane, withinLaneRank } = rank({
        kind: "task",
        priority,
        group,
        updatedAt: task.updatedAt,
        isBlocked: isBlockedByIssue,
      }, role, now);

      const missingSignals = task.requiresSignals.filter(
        (s) => !includesEquivalentSignal(liveSignals, s),
      );

      const taskRecoveryRoute =
        derivedState === "BLOCKED_BY_ISSUE"
          ? deriveBlockedTaskRecoveryRoute(task.id, jobStage.id, blockingIssueCandidates)
          : null;

      items.push({
        id: `task-${task.id}`,
        kind: "task",
        title: task.title,
        subtitle: task.jobStage.title,
        status: taskIsOverdue
          ? "Overdue"
          : taskIsDueToday
            ? "Due today"
            : taskIsScheduledSoon
              ? "Scheduled"
              : schedulingAttentionOverride?.status ?? taskStateLabel(derivedState),
        priority,
        group,
        lens: schedulingAttentionOverride
          ? schedulingAttentionOverride.lens
          : taskIsOverdue || taskIsDueToday
            ? "today"
            : derivedState === "BLOCKED_BY_SIGNAL"
              ? "waiting"
              : taskIsScheduledSoon
                ? "upcoming"
                : "attention",
        lane,
        withinLaneRank,
        filterCategory: "tasks",
        reason: schedulingAttentionOverride
          ? schedulingAttentionOverride.reason
          : taskIsOverdue
            ? "Task due date has passed and needs action."
            : taskIsDueToday
              ? "Task is due today."
              : derivedState === "BLOCKED_BY_ISSUE"
                ? "Blocked by an open issue."
                : derivedState === "BLOCKED_BY_SIGNAL"
                  ? `Waiting for: ${missingSignals.map(formatDependencyLabel).join(", ")}`
                  : derivedState === "NEEDS_PROOF"
                    ? "Task needs completion proof."
                    : taskIsScheduledSoon
                      ? "Task has upcoming scheduled work."
                      : "Task is ready to complete.",
        nextStep: taskRecoveryRoute?.nextStep ??
          (schedulingAttentionOverride?.nextStep ??
            (isWaitingOnSignals
              ? "Wait for prerequisites."
              : isBlockedByIssue
                ? "Resolve blocker."
                : "Complete the task.")),
        recordId: task.id,
        parentRecordId: job.id,
        parentLabel: jobParentLabel ?? undefined,
        contextLine: jobContextLine ?? undefined,
        href: `/jobs/${job.id}`,
        updatedAt: task.updatedAt,
        assignedUserId: task.assignedUserId,
        dueAt: task.dueAt,
        scheduledStartAt: task.scheduledStartAt,
        isBlocked: isBlockedByIssue,
        isWaitingOnSignals,
        missingSignals: missingSignals.length > 0 ? missingSignals : undefined,
        executionHealthState: isPrimary ? executionHealth.primaryState : undefined,
        executionHealthHeadline: isPrimary ? executionHealth.headline : undefined,
        actionKind: taskRecoveryRoute?.actionKind,
        actionLabel: taskRecoveryRoute?.actionLabel,
        actionIssueId: taskRecoveryRoute?.actionIssueId,
        actionTaskId: taskRecoveryRoute?.actionTaskId,
      });
    }

    if (job.tasks.length === 0) {
      const { lane, withinLaneRank } = rank({
        kind: "job",
        priority: "medium",
        group: "investigate",
        updatedAt: job.updatedAt,
        isBlocked: isJobExecutionBlocked,
      }, role, now);

      items.push({
        id: `job-${job.id}`,
        kind: "job",
        title: jobCardTitle,
        subtitle: jobCustomerName ?? undefined,
        status: job.status,
        priority: "medium",
        group: "investigate",
        lens: "attention",
        lane,
        withinLaneRank,
        filterCategory: "jobs",
        reason: "Active job has no remaining TODO or IN_PROGRESS tasks.",
        nextStep: "Review job completion or add tasks.",
        recordId: job.id,
        parentRecordId: job.customerId || job.leadId || undefined,
        parentLabel: jobParentLabel ?? undefined,
        contextLine: jobContextLine ?? undefined,
        href: `/jobs/${job.id}`,
        updatedAt: job.updatedAt,
        isBlocked: isJobExecutionBlocked,
        executionHealthState: executionHealth.primaryState,
        executionHealthHeadline: executionHealth.headline,
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
      recoveryFlow: {
        select: {
          status: true,
          tasks: {
            orderBy: { recoveryFlowOrder: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              recoveryFlowOrder: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  for (const issue of issues) {
    const issueJobsite = resolveJobsiteLineForQuoteOrJob({
      serviceLocation: null,
      customerLocations: [],
      leadRow: issue.job.lead
        ? { address: issue.job.lead.address, signals: issue.job.lead.signals }
        : null,
    });
    const issueWorkContext = resolveJobWorkContext({
      jobTitle: issue.job.title,
      customer: issue.job.customer,
      lead: issue.job.lead,
      jobsiteLine: issueJobsite,
    });

    let priority: WorkstationWorkItemPriority = "high";

    const recoveryRoute = deriveIssueRecoveryRoute({
      id: issue.id,
      status: issue.status,
      severity: issue.severity,
      recoveryFlow: issue.recoveryFlow
        ? {
            status: issue.recoveryFlow.status,
            tasks: issue.recoveryFlow.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              recoveryFlowOrder: t.recoveryFlowOrder,
            })),
          }
        : null,
    });

    if (issue.recoveryFlow) {
      const flow = issue.recoveryFlow;
      if (flow.status === JobRecoveryFlowStatus.DRAFT) {
        priority = "critical";
      } else if (
        flow.status === JobRecoveryFlowStatus.ACTIVE &&
        flow.tasks.length > 0 &&
        flow.tasks.every(
          (t) => t.status === JobTaskStatus.DONE || t.status === JobTaskStatus.CANCELED,
        )
      ) {
        priority = "critical";
      }
    }

    const { lane, withinLaneRank } = rank({
      kind: "investigate",
      priority,
      group: "investigate",
      updatedAt: issue.updatedAt,
    }, role, now);

    items.push({
      id: `issue-${issue.id}`,
      kind: "investigate",
      title: issue.title,
      subtitle: `Issue: ${issue.type.replace(/_/g, " ")}`,
      status: issue.status,
      priority,
      group: "investigate",
      lens: "attention",
      lane,
      withinLaneRank,
      filterCategory: "issues",
      reason: issue.description || "Blocking issue needs resolution.",
      nextStep: recoveryRoute.nextStep,
      recordId: issue.id,
      parentRecordId: issue.jobId,
      parentLabel: issueWorkContext.parentLabel ?? undefined,
      contextLine: issueWorkContext.contextLine,
      href: `/jobs/${issue.jobId}#job-issues`,
      updatedAt: issue.updatedAt,
      actionKind: recoveryRoute.actionKind,
      actionLabel: recoveryRoute.actionLabel,
      actionIssueId: recoveryRoute.actionIssueId,
      actionTaskId: recoveryRoute.actionTaskId,
    });
  }

  // 5. Job Payment Requirements (effectively due — single emission path)
  const paymentCandidates = await db.jobPaymentRequirement.findMany({
    where: {
      organizationId,
      status: { in: [JobPaymentRequirementStatus.DUE, JobPaymentRequirementStatus.PENDING] },
      job: { status: JobStatus.ACTIVE },
    },
    include: {
      job: {
        include: {
          customer: true,
          lead: true,
          stages: {
            select: {
              id: true,
              sortOrder: true,
              stageId: true,
              title: true,
              tasks: {
                select: { status: true, recoveryFlowId: true },
              },
            },
          },
          paymentRequirements: {
            select: {
              id: true,
              title: true,
              status: true,
              requiredBeforeStageId: true,
              sourcePaymentScheduleItemId: true,
            },
          },
        },
      },
      requiredBeforeStage: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const workstationPaymentScheduleAnchors = await loadScheduleAnchorsByIds(
    paymentCandidates.flatMap((payment) => [
      payment.sourcePaymentScheduleItemId,
      ...payment.job.paymentRequirements.map((r) => r.sourcePaymentScheduleItemId),
    ]),
  );

  const emittedPaymentIds = new Set<string>();

  for (const payment of paymentCandidates) {
    const enrichedJobRequirements = attachScheduleAnchorsToRequirements(
      payment.job.paymentRequirements,
      workstationPaymentScheduleAnchors,
    );
    const ctx = buildPaymentDueContextFromJob({
      status: payment.job.status,
      stages: payment.job.stages,
      paymentRequirements: enrichedJobRequirements,
    });
    const dueOnJob = getUnsettledEffectivelyDueRequirements(
      enrichedJobRequirements,
      ctx,
    );
    if (!dueOnJob.some((r) => r.id === payment.id)) continue;
    if (emittedPaymentIds.has(payment.id)) continue;
    emittedPaymentIds.add(payment.id);
    const paymentJobsite = resolveJobsiteLineForQuoteOrJob({
      serviceLocation: null,
      customerLocations: [],
      leadRow: payment.job.lead
        ? { address: payment.job.lead.address, signals: payment.job.lead.signals }
        : null,
    });
    const paymentWorkContext = resolveJobWorkContext({
      jobTitle: payment.job.title,
      customer: payment.job.customer,
      lead: payment.job.lead,
      jobsiteLine: paymentJobsite,
    });

    const amountLabel = payment.amountCents
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
          payment.amountCents / 100,
        )
      : null;

    const { lane, withinLaneRank } = rank({
      kind: "investigate",
      priority: "high",
      group: "investigate",
      updatedAt: payment.updatedAt,
    }, role, now);

    items.push({
      id: `payment-${payment.id}`,
      kind: "investigate",
      title: payment.title,
      subtitle: amountLabel ?? undefined,
      status: payment.status,
      priority: "high",
      group: "investigate",
      lens: "attention",
      lane,
      withinLaneRank,
      filterCategory: "payments",
      reason: payment.requiredBeforeStage
        ? `Payment required before ${payment.requiredBeforeStage.title}.`
        : "Payment is due.",
      nextStep: "Record payment or waive requirement.",
      recordId: payment.id,
      parentRecordId: payment.jobId,
      parentLabel: paymentWorkContext.parentLabel ?? undefined,
      contextLine: paymentWorkContext.contextLine,
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
    const logJobsite = resolveJobsiteLineForQuoteOrJob({
      serviceLocation: null,
      customerLocations: [],
      leadRow: log.job.lead
        ? { address: log.job.lead.address, signals: log.job.lead.signals }
        : null,
    });
    const logWorkContext = resolveJobWorkContext({
      jobTitle: log.job.title,
      customer: log.job.customer,
      lead: log.job.lead,
      jobsiteLine: logJobsite,
    });

    const { lane, withinLaneRank } = rank({
      kind: "daily-log",
      priority: "medium",
      group: "investigate",
      updatedAt: log.updatedAt,
    }, role, now);

    items.push({
      id: `log-${log.id}`,
      kind: "daily-log",
      title: `Daily Log: ${log.logDate.toLocaleDateString()}`,
      subtitle: logWorkContext.customerName ?? undefined,
      status: log.status,
      priority: "medium",
      group: "investigate",
      lens: "attention",
      lane,
      withinLaneRank,
      filterCategory: "logs",
      reason: "Daily log needs review and approval.",
      nextStep: "Review and approve log.",
      recordId: log.id,
      parentRecordId: log.jobId,
      parentLabel: logWorkContext.parentLabel ?? undefined,
      contextLine: logWorkContext.contextLine,
      href: `/jobs/${log.jobId}`, // No popup for now, link to job
      updatedAt: log.updatedAt,
    });
  }

  const scheduleCleanupJobs = await queryJobsNeedingScheduleCleanupAttention(organizationId, now);
  for (const cleanupJob of scheduleCleanupJobs) {
    const { lane, withinLaneRank } = rank(
      {
        kind: "schedule",
        priority: cleanupJob.externalCount > 0 ? "high" : "medium",
        group: "investigate",
        updatedAt: cleanupJob.updatedAt,
      },
      role,
      now,
    );

    items.push({
      id: `job-schedule-cleanup-${cleanupJob.jobId}`,
      kind: "schedule",
      title: "Schedule cleanup required",
      subtitle: cleanupJob.jobTitle,
      status: "Archived job",
      priority: cleanupJob.externalCount > 0 ? "high" : "medium",
      group: "investigate",
      lens: "attention",
      lane,
      withinLaneRank,
      filterCategory: "jobs",
      reason:
        cleanupJob.externalCount > 0
          ? `${cleanupJob.pendingCount} future event(s) remain, including ${cleanupJob.externalCount} external appointment(s) needing explicit review.`
          : `${cleanupJob.pendingCount} future internal schedule block(s) need cleanup after archive.`,
      nextStep: "Review and confirm schedule cleanup on the job record.",
      recordId: cleanupJob.jobId,
      href: `/jobs/${cleanupJob.jobId}`,
      updatedAt: cleanupJob.updatedAt,
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
