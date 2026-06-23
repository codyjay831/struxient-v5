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
  LeadVisitRequestStatus,
  CustomerRequestStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import { evaluateQuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import {
  buildQuoteActivationReadinessInput,
  type QuotePlanSurfaceTask,
} from "@/lib/quote-execution-plan-surface";
import {
  QUOTE_PLAN_INPUT_SCHEMA_VERSION,
  buildQuotePlanPlanningInput,
  loadQuotePlanContext,
} from "@/lib/quote-plan/quote-plan-context";
import { computeQuotePlanningInputHash } from "@/lib/quote-plan/planning-input-hash";
import { getOpportunityFlow } from "@/lib/opportunity-flow";
import { opportunityWorkspaceHref } from "@/lib/opportunity-tab-routing";
import {
  jobsiteLineFromLead,
  isLeadAddressQuoteReady,
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
  deriveTaskPaymentHold,
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
import {
  getJobVisibilityWhere,
  getTaskVisibilityWhere,
} from "@/lib/authz/resource-access";
import { canReadCommercial } from "@/lib/authz/capabilities";
import { getWorkstationPaymentHoldLabel } from "@/lib/authz/payment-visibility";
import {
  evaluateCustomerMatchGate,
  loadOrgCustomersForMatchGate,
} from "@/lib/lead-customer-match-gate";
import { hasBlockingCustomerMatch } from "@/lib/lead-customer-match-hints";
import { classifyLeadWorkstationAttention } from "@/lib/workstation-lead-attention";
import { toOpportunityFlowVisitInput } from "@/lib/scheduling/serialize-lead-visit-request";
import { resolveLeadVisitScheduledStart } from "@/lib/scheduling/lead-visit-schedule-service";
import {
  classifyAssignedLeadVisitWorkstationAttention,
  resolveLeadVisitWorkstationHref,
  visitHasMissingAccess,
  visitHasMissingOutcome,
} from "@/lib/scheduling/lead-visit-lead-access";
import {
  hasAccessSnapshotContent,
  LeadVisitAccessSnapshotSchema,
} from "@/lib/scheduling/lead-visit-schemas";
import { formatCompactAge } from "@/lib/compact-age";
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
  /** Short scope label for compact identity rows. */
  scopeLabel?: string | null;
  /** Jobsite/service address display line. */
  addressLine?: string | null;
  /** Human age label for commercial attention, e.g. "Age 4d". */
  ageLabel?: string | null;
  /** Money/value display label when useful for quick filtering. */
  valueLabel?: string | null;
  /** Human record type label for compact badges. */
  typeLabel?: string;
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
  /** When set on quote items, Workstation opens the Opportunity workspace Quote tab. */
  leadAnchorId?: string | null;
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
  /** Payment hold gating this task's stage (derived). */
  paymentHoldLabel?: string;
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

function formatMoneyLabel(cents: number | null | undefined): string | null {
  if (!cents || cents <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

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
  userId: string,
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

  const commercialReadable = canReadCommercial(role);
  const jobVisibilityWhere = getJobVisibilityWhere(role, userId);
  const taskVisibilityWhere = getTaskVisibilityWhere(role, userId);

  const knownLeadStatuses = new Set(Object.values(LeadStatus));
  const pipelineStatuses = LEAD_PIPELINE_OPEN_STATUSES.filter((s) =>
    knownLeadStatuses.has(s),
  );

  // 1. Opportunities
  const leads = commercialReadable ? await db.lead.findMany({
    where: { organizationId, status: { in: pipelineStatuses } },
    include: {
      customer: {
        include: {
          serviceLocations: {
            where: { organizationId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: { googlePlaceId: true },
          },
        },
      },
      serviceLocation: {
        select: { googlePlaceId: true, organizationId: true },
      },
      visitRequests: {
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
  }) : [];

  const orgCustomersForMatch =
    commercialReadable && leads.some((lead) => lead.customerId == null)
      ? await loadOrgCustomersForMatchGate(organizationId)
      : [];

  for (const lead of leads) {
    const hasActiveQuote = lead.quotes.length > 0;

    if (hasActiveQuote) continue;

    const leadJobsiteLine = jobsiteLineFromLead(lead);
    const leadWorkContext = resolveJobWorkContext({
      jobTitle: lead.title,
      customer: lead.customer,
      lead,
      jobsiteLine: leadJobsiteLine,
    });

    const matchHints =
      lead.customerId == null
        ? evaluateCustomerMatchGate({
            customerId: lead.customerId,
            email: lead.email,
            phone: lead.phone,
            orgCustomers: orgCustomersForMatch,
          })
        : null;
    const hasExistingCustomerMatch =
      matchHints != null && hasBlockingCustomerMatch(matchHints);

    const progress = getOpportunityFlow({
      lead: {
        id: lead.id,
        status: lead.status,
        followUpAt: lead.followUpAt,
        customerId: lead.customerId,
        contactName: lead.contactName,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        jobsiteAddressLine: leadJobsiteLine,
        isAddressVerified: isLeadAddressQuoteReady(lead, {
          resolvedServiceLocation:
            lead.serviceLocation && lead.serviceLocation.organizationId === organizationId
              ? lead.serviceLocation
              : null,
          customerPrimaryLocation: lead.customer?.serviceLocations[0] ?? null,
        }),
      },
      quotes: lead.quotes.map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        lineItemCount: q._count.lineItems,
        totalCents: q.totalCents,
        createdAt: q.updatedAt,
        updatedAt: q.updatedAt,
        revisionOfQuoteId: null,
        revisionNumber: null,
        latestSendAt: null,
        latestApprovalAt: null,
        job: q.job,
      })),
      visits: lead.visitRequests.map((v) => toOpportunityFlowVisitInput(v)),
      changeRequests: [],
      hasExistingCustomerMatch,
      now,
    });

    const recordState = buildLeadRecordActionState({
      leadId: lead.id,
      title: lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      progress,
    });
    const workflow = toEmbeddedWorkflow(recordState);

    const pendingVisit =
      lead.visitRequests.find((v) => v.status === "PENDING") ?? null;
    const scheduledVisit =
      lead.visitRequests.find((v) => v.status === LeadVisitRequestStatus.CONFIRMED) ?? null;
    const noShowVisit =
      lead.visitRequests.find((v) => v.status === LeadVisitRequestStatus.NO_SHOW) ?? null;
    const completedMissingOutcome = lead.visitRequests.find(
      (v) => v.status === LeadVisitRequestStatus.COMPLETED && (!v.outcome || !v.nextAction),
    );
    const scheduledStart = scheduledVisit
      ? resolveLeadVisitScheduledStart(scheduledVisit)
      : null;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isVisitDueTodayOrTomorrow =
      scheduledStart != null &&
      scheduledStart.getTime() <= tomorrow.getTime() + 24 * 60 * 60 * 1000 &&
      scheduledStart.getTime() >= now.getTime() - 24 * 60 * 60 * 1000;
    const accessParsed = scheduledVisit
      ? LeadVisitAccessSnapshotSchema.safeParse(scheduledVisit.accessSnapshotJson)
      : null;
    const hasMissingAccess =
      scheduledVisit != null &&
      !(accessParsed?.success && hasAccessSnapshotContent(accessParsed.data));

    const { group, priority } = classifyLeadWorkstationAttention({
      conditionCode: progress.conditionCode,
      hasPendingVisit: pendingVisit != null,
      hasMissingAccess,
      hasNoShowRecovery: noShowVisit != null,
      hasCompletedMissingFollowUp: completedMissingOutcome != null,
      isVisitDueTodayOrTomorrow,
    });

    const { lane, withinLaneRank, reason: rankReason } = rank({
      kind: "lead",
      priority,
      group,
      updatedAt: lead.updatedAt,
    }, role, now);

    const effectiveReason = pendingVisit
      ? `Site visit requested for ${pendingVisit.requestedDate?.toLocaleDateString() ?? "anytime"}.`
      : hasMissingAccess
        ? "Scheduled site visit is missing access details."
        : noShowVisit
          ? "Site visit no-show needs recovery."
          : rankReason || workflow.reason;
    const effectiveNextStep = workflow.nextAction?.label ?? "Review in Sales.";

    items.push({
      id: `lead-${lead.id}`,
      kind: "lead",
      title: leadWorkContext.scopeLabel || lead.title,
      subtitle: lead.contactName || lead.email || lead.phone || undefined,
      contextLine: leadWorkContext.contextLine || undefined,
      scopeLabel: leadWorkContext.scopeLabel,
      addressLine: leadJobsiteLine,
      ageLabel: `Age ${formatCompactAge(lead.createdAt, now)}`,
      typeLabel: "Lead",
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
      parentLabel: leadWorkContext.parentLabel || lead.contactName || lead.email || lead.phone || undefined,
      href: `/leads/${lead.id}`,
      updatedAt: lead.updatedAt,
      workflow,
    });
  }

  if (!commercialReadable) {
    const assignedVisits = await db.leadVisitRequest.findMany({
      where: {
        organizationId,
        assignedUserId: userId,
        status: {
          in: [
            LeadVisitRequestStatus.PENDING,
            LeadVisitRequestStatus.CONFIRMED,
            LeadVisitRequestStatus.NO_SHOW,
            LeadVisitRequestStatus.COMPLETED,
          ],
        },
      },
      include: {
        lead: {
          select: {
            id: true,
            title: true,
            contactName: true,
            email: true,
            phone: true,
            contact: true,
            request: true,
            address: true,
            signals: true,
            updatedAt: true,
          },
        },
      },
      orderBy: [{ scheduledStartAt: "asc" }, { confirmedDate: "asc" }, { createdAt: "desc" }],
    });

    for (const visit of assignedVisits) {
      const scheduledStart = resolveLeadVisitScheduledStart(visit);
      const hasMissingAccess =
        visit.status === LeadVisitRequestStatus.CONFIRMED &&
        visitHasMissingAccess(visit.accessSnapshotJson);
      const hasMissingOutcome = visitHasMissingOutcome(visit);
      const attention = classifyAssignedLeadVisitWorkstationAttention({
        status: visit.status,
        scheduledStart,
        hasMissingAccess,
        hasMissingOutcome,
        now,
      });
      if (!attention.include) continue;

      const visitJobsiteLine = jobsiteLineFromLead(visit.lead);
      const visitWorkContext = resolveJobWorkContext({
        jobTitle: visit.lead.title,
        customer: null,
        lead: visit.lead,
        jobsiteLine: visitJobsiteLine,
      });

      const { lane, withinLaneRank } = rank(
        { kind: "lead", priority: attention.priority, group: attention.group, updatedAt: visit.updatedAt },
        role,
        now,
      );

      items.push({
        id: `assigned-visit-${visit.id}`,
        kind: "lead",
        title: visitWorkContext.scopeLabel || visit.lead.title,
        subtitle: visit.lead.contactName || visit.lead.email || visit.lead.phone || undefined,
        contextLine: visitWorkContext.contextLine || undefined,
        scopeLabel: visitWorkContext.scopeLabel,
        addressLine: visitJobsiteLine,
        ageLabel: `Age ${formatCompactAge(visit.updatedAt, now)}`,
        typeLabel: "Lead",
        status: visit.status,
        priority: attention.priority,
        group: attention.group,
        lens: attention.lens,
        lane,
        withinLaneRank,
        filterCategory: "leads",
        reason: attention.reason,
        nextStep: attention.nextStep,
        recordId: visit.lead.id,
        parentLabel:
          visitWorkContext.parentLabel ||
          visit.lead.contactName ||
          visit.lead.email ||
          visit.lead.phone ||
          undefined,
        href: resolveLeadVisitWorkstationHref(visit.lead.id),
        updatedAt: visit.updatedAt,
        assignedUserId: visit.assignedUserId,
        scheduledStartAt: scheduledStart,
      });
    }
  }

  // 2. Quotes
  const quotes = commercialReadable ? await db.quote.findMany({
    where: { organizationId, status: { in: [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.APPROVED] } },
    include: {
      customer: {
        include: {
          serviceLocations: {
            where: { organizationId },
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
          },
        },
      },
      serviceLocation: true,
      lead: {
        include: {
          visitRequests: {
            where: {
              status: {
                in: [LeadVisitRequestStatus.PENDING, LeadVisitRequestStatus.CONFIRMED],
              },
            },
            orderBy: [{ confirmedDate: "asc" }, { requestedDate: "asc" }, { createdAt: "desc" }],
          },
        },
      },
      job: true,
      checkpoints: {
        where: { kind: QuoteCheckpointKind.APPROVAL },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      lineItems: true,
      executionPlan: {
        select: {
          status: true,
          planVersion: true,
          planningInputHash: true,
          planningInputSchemaVersion: true,
          tasks: {
            select: {
              id: true,
              title: true,
              stageId: true,
              category: true,
              sortOrder: true,
              providesSignals: true,
              requiresSignals: true,
              hardSignal: true,
              scopes: { select: { quoteLineItemId: true } },
            },
          },
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
      changeRequests: {
        where: { resolvedAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          message: true,
          createdAt: true,
          requiresVisit: true,
          resultingQuoteId: true,
        },
      },
      revisedQuotes: {
        where: { status: QuoteStatus.DRAFT },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          lineItems: { select: { id: true } },
        },
      },
    },
  }) : [];

  for (const quote of quotes) {
    const latestApproval = quote.checkpoints[0];
    const isCustomerAccepted = latestApproval?.source === QuoteCheckpointSource.CUSTOMER_PORTAL;

    const planContext = await loadQuotePlanContext(quote.id, organizationId);
    const currentPlanningInputHash =
      planContext && quote.executionPlan
        ? computeQuotePlanningInputHash(
            buildQuotePlanPlanningInput(planContext),
            quote.executionPlan.planningInputSchemaVersion ?? QUOTE_PLAN_INPUT_SCHEMA_VERSION,
          )
        : null;

    const surfaceLines = quote.lineItems.map((line) => ({
      id: line.id,
      description: line.description,
      sortOrder: line.sortOrder,
      executionRelevant: line.executionRelevant,
    }));

    const planTasks: QuotePlanSurfaceTask[] =
      quote.executionPlan?.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        stageId: task.stageId,
        category: task.category,
        sortOrder: task.sortOrder,
        providesSignals: task.providesSignals,
        requiresSignals: task.requiresSignals,
        hardSignal: task.hardSignal,
        scopeLineIds: task.scopes.map((scope) => scope.quoteLineItemId),
      })) ?? [];

    const activationReadiness = evaluateQuoteJobActivationReadiness(
      buildQuoteActivationReadinessInput({
        status: quote.status,
        hasApprovalCheckpoint: quote.checkpoints.length > 0,
        executionPlan: quote.executionPlan
          ? {
              status: quote.executionPlan.status,
              planVersion: quote.executionPlan.planVersion,
              planningInputHash: quote.executionPlan.planningInputHash,
              planningInputSchemaVersion: quote.executionPlan.planningInputSchemaVersion,
            }
          : null,
        currentPlanningInputHash,
        lines: surfaceLines,
        planTasks,
        quoteTotalCents: quote.totalCents,
        paymentSchedule: quote.paymentSchedule.map((item) => ({
          id: item.id,
          title: item.title,
          anchorType: item.anchorType,
          amountCents: item.amountCents,
          percentage: item.percentage,
        })),
      }),
    );

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

    const quoteJobsiteLine = resolveJobsiteLineForQuoteOrJob({
      serviceLocation:
        quote.serviceLocation && quote.serviceLocation.organizationId === organizationId
          ? {
              formattedAddress: quote.serviceLocation.formattedAddress,
              addressLine1: quote.serviceLocation.addressLine1,
            }
          : null,
      customerLocations: quote.customer?.serviceLocations ?? [],
      leadRow: quote.lead ? { address: quote.lead.address, signals: quote.lead.signals } : null,
    });
    const quoteWorkContext = resolveJobWorkContext({
      jobTitle: quote.title,
      customer: quote.customer,
      lead: quote.lead,
      jobsiteLine: quoteJobsiteLine,
    });
    const primaryIdentity = quoteWorkContext.scopeLabel || quote.lead?.title || quote.customer?.displayName || quote.title;
    const secondaryIdentity = quote.title !== primaryIdentity ? quote.title : null;

    const parentLabel =
      quoteWorkContext.parentLabel || quote.customer?.displayName || quote.lead?.title || undefined;
    const subtitle = secondaryIdentity
      ? `Quote: ${secondaryIdentity}`
      : quote.customer?.displayName || undefined;

    const openChangeRequest = quote.changeRequests[0] ?? null;
    const draftRevision = quote.revisedQuotes[0] ?? null;
    const openSalesVisit = quote.lead?.visitRequests[0] ?? null;
    const openSalesVisitDate = openSalesVisit?.confirmedDate ?? openSalesVisit?.requestedDate ?? null;
    const openSalesVisitDateLabel = openSalesVisitDate
      ? openSalesVisitDate.toLocaleDateString()
      : "anytime";
    const openSalesVisitIsPending = openSalesVisit?.status === LeadVisitRequestStatus.PENDING;

    const recordState = buildQuoteRecordActionState({
      quoteId: quote.id,
      title: primaryIdentity,
      subtitle,
      customerId: quote.customerId,
      leadId: quote.leadId,
      readiness,
    });
    const workflow = toEmbeddedWorkflow(recordState);

    const isApprovedQuoteHandoff =
      readiness.state === "APPROVED_READY_TO_ACTIVATE" ||
      readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW";

    let priority: WorkstationWorkItemPriority = "medium";
    if (openSalesVisitIsPending) {
      priority = "critical";
    } else if (openSalesVisit) {
      priority = "high";
    } else if (
      workflow.priority === "blocking" ||
      isApprovedQuoteHandoff ||
      openChangeRequest
    ) {
      priority = "critical";
    } else if (workflow.priority === "critical" || quote.updatedAt > urgentThreshold) {
      priority = "high";
    } else if (workflow.priority === "watching") {
      priority = "low";
    }

    const group: WorkstationWorkItemGroup = openSalesVisitIsPending
      ? "investigate"
      : openSalesVisit
        ? "scheduled"
        : workflow.priority === "blocking" ||
      isApprovedQuoteHandoff ||
      openChangeRequest
        ? "investigate"
        : "ready";

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
      contextLine: quoteWorkContext.contextLine || undefined,
      scopeLabel: quoteWorkContext.scopeLabel,
      addressLine: quoteJobsiteLine,
      ageLabel: `Age ${formatCompactAge(quote.updatedAt, now)}`,
      valueLabel: formatMoneyLabel(quote.totalCents),
      typeLabel: "Quote",
      status: openSalesVisit
        ? openSalesVisitIsPending
          ? "Site visit requested"
          : "Site visit scheduled"
        : openChangeRequest
        ? draftRevision
          ? draftRevision.lineItems.length > 0
            ? "Revision ready to send"
            : "Revision draft in progress"
          : "Customer requested changes"
        : quote.status,
      priority,
      group,
      lens: "attention",
      lane,
      withinLaneRank,
      filterCategory: "quotes",
      reason: openSalesVisit
        ? openSalesVisitIsPending
          ? `Site visit requested for ${openSalesVisitDateLabel}.`
          : `Site visit scheduled for ${openSalesVisitDateLabel}.`
        : openChangeRequest
        ? openChangeRequest.requiresVisit
          ? "Customer requested changes and follow-up visit may be required."
          : "Customer requested changes on this quote."
        : isApprovedQuoteHandoff
          ? "Approved quote is waiting for job setup."
        : isCustomerAccepted
          ? "Accepted by customer via portal."
          : rankReason || workflow.reason,
      nextStep: openSalesVisit
        ? openSalesVisitIsPending
          ? "Schedule site visit."
          : "Complete site visit."
        : openChangeRequest
        ? draftRevision
          ? "Continue revision draft."
          : "Create revision draft."
        : workflow.nextAction?.label || "Review quote.",
      recordId: quote.id,
      parentRecordId: quote.customerId || quote.leadId || undefined,
      parentLabel,
      leadAnchorId: quote.leadId,
      href: quote.leadId
        ? opportunityWorkspaceHref(quote.leadId, "quote")
        : `/quotes/${quote.id}`,
      updatedAt: quote.updatedAt,
      workflow,
    });
  }

  // 2b. Change Orders
  const changeOrders = commercialReadable ? await db.changeOrder.findMany({
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
  }) : [];

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
    where: { organizationId, status: JobStatus.ACTIVE, ...jobVisibilityWhere },
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
        where: { completedAt: null, ...taskVisibilityWhere },
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

    const paymentDueCtx = buildPaymentDueContextFromJob({
      status: job.status,
      stages: stagesForHealth.map((stage) => ({
        id: stage.id,
        sortOrder: stage.sortOrder,
        stageId: stage.stageId,
        title: stage.title,
        tasks: stage.tasks.map((task) => ({
          status: task.status,
          recoveryFlowId: task.recoveryFlowId,
        })),
      })),
      paymentRequirements: enrichedPaymentRequirements,
    });

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

      const paymentHold = deriveTaskPaymentHold(
        jobStage.id,
        enrichedPaymentRequirements,
        paymentDueCtx,
      );

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
        ...(paymentHold
          ? { paymentHoldLabel: getWorkstationPaymentHoldLabel(paymentHold.title, role) }
          : {}),
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
      job: jobVisibilityWhere,
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

  // 5. Job Payment Requirements (effectively due — office/commercial read only)
  if (commercialReadable) {
  const paymentCandidates = await db.jobPaymentRequirement.findMany({
    where: {
      organizationId,
      status: { in: [JobPaymentRequirementStatus.DUE, JobPaymentRequirementStatus.PENDING] },
      job: { status: JobStatus.ACTIVE, ...jobVisibilityWhere },
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
  }

  // 6. Daily Job Logs (Needing Review)
  const draftLogs = await db.dailyJobLog.findMany({
    where: {
      organizationId,
      status: DailyJobLogStatus.DRAFT,
      job: jobVisibilityWhere,
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

  if (commercialReadable) {
    const customerPortalRequests = await db.customerRequest.findMany({
      where: {
        organizationId,
        status: { in: [CustomerRequestStatus.OPEN, CustomerRequestStatus.NEEDS_REVIEW] },
        job: { status: JobStatus.ACTIVE, ...jobVisibilityWhere },
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            updatedAt: true,
            customer: {
              include: {
                serviceLocations: {
                  where: { organizationId },
                  orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                },
              },
            },
            lead: { select: { address: true, signals: true } },
            serviceLocation: {
              select: { formattedAddress: true, addressLine1: true, organizationId: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 25,
    });

    for (const request of customerPortalRequests) {
      const jobsiteLine = resolveJobsiteLineForQuoteOrJob({
        serviceLocation:
          request.job.serviceLocation &&
          request.job.serviceLocation.organizationId === organizationId
            ? {
                formattedAddress: request.job.serviceLocation.formattedAddress,
                addressLine1: request.job.serviceLocation.addressLine1,
              }
            : null,
        customerLocations: request.job.customer?.serviceLocations ?? [],
        leadRow: request.job.lead
          ? { address: request.job.lead.address, signals: request.job.lead.signals }
          : null,
      });
      const workContext = resolveJobWorkContext({
        jobTitle: request.job.title,
        customer: request.job.customer,
        jobsiteLine,
      });

      const { lane, withinLaneRank } = rank(
        {
          kind: "job",
          priority: request.status === CustomerRequestStatus.NEEDS_REVIEW ? "high" : "medium",
          group: "investigate",
          updatedAt: request.createdAt,
        },
        role,
        now,
      );

      items.push({
        id: `customer-request-${request.id}`,
        kind: "job",
        title: request.title,
        subtitle: workContext.customerName ?? undefined,
        contextLine: workContext.contextLine,
        addressLine: jobsiteLine,
        status: request.status,
        priority: request.status === CustomerRequestStatus.NEEDS_REVIEW ? "high" : "medium",
        group: "investigate",
        lens: "attention",
        lane,
        withinLaneRank,
        filterCategory: "jobs",
        reason: request.message,
        nextStep: "Review and resolve the customer portal request.",
        recordId: request.id,
        parentRecordId: request.jobId,
        parentLabel: workContext.parentLabel ?? undefined,
        href: `/jobs/${request.jobId}#job-customer-portal`,
        updatedAt: request.createdAt,
        typeLabel: "Customer request",
      });
    }
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
