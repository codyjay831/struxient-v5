import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
} from "@prisma/client";
import type {
  OpportunityAction,
  OpportunityActionKind,
  OpportunityFlowView,
} from "@/lib/opportunity-flow";

/** Actions a FIELD estimator may perform on the restricted assigned-visit surface. */
export const ASSIGNED_VISIT_FIELD_ACTION_KINDS = new Set<OpportunityActionKind>([
  "COMPLETE_SALES_VISIT",
  "SCHEDULE_SALES_VISIT",
]);

export type AssignedVisitSurfaceVisitInput = {
  id: string;
  status: LeadVisitRequestStatus;
  outcome?: LeadVisitOutcome | null;
  nextAction?: LeadVisitNextAction | null;
  updatedAt?: Date;
};

export function isAssignedVisitFieldAction(kind: OpportunityActionKind): boolean {
  return ASSIGNED_VISIT_FIELD_ACTION_KINDS.has(kind);
}

export function assignedVisitFieldStatusFromOutcome(input: {
  status: LeadVisitRequestStatus;
  outcome?: LeadVisitOutcome | null;
  nextAction?: LeadVisitNextAction | null;
}): string | null {
  if (input.status === LeadVisitRequestStatus.NO_SHOW) {
    return "Follow-up needed";
  }

  if (input.status !== LeadVisitRequestStatus.COMPLETED) {
    return null;
  }

  if (input.outcome == null && input.nextAction == null) {
    return null;
  }

  if (input.outcome === LeadVisitOutcome.QUOTE_READY) {
    return "Quote ready for office review";
  }

  if (
    input.outcome === LeadVisitOutcome.MISSING_INFORMATION ||
    input.nextAction === LeadVisitNextAction.COLLECT_MISSING_INFO
  ) {
    return "Missing info recorded";
  }

  if (
    input.outcome === LeadVisitOutcome.FOLLOW_UP_NEEDED ||
    input.nextAction === LeadVisitNextAction.FOLLOW_UP_CUSTOMER
  ) {
    return "Follow-up needed";
  }

  if (
    input.outcome === LeadVisitOutcome.RESCHEDULE_NEEDED ||
    input.outcome === LeadVisitOutcome.CUSTOMER_NO_SHOW ||
    input.outcome === LeadVisitOutcome.CONTRACTOR_MISSED ||
    input.nextAction === LeadVisitNextAction.SCHEDULE_ANOTHER_VISIT
  ) {
    return "Follow-up needed";
  }

  if (
    input.outcome === LeadVisitOutcome.QUOTE_NEEDS_REVISION ||
    input.nextAction === LeadVisitNextAction.OPEN_OR_REVISE_QUOTE
  ) {
    return "Visit complete — office follow-up needed";
  }

  if (
    input.outcome === LeadVisitOutcome.DISQUALIFIED ||
    input.nextAction === LeadVisitNextAction.CLOSE_OR_DISQUALIFY
  ) {
    return "Visit complete — office follow-up needed";
  }

  return "Visit complete — office follow-up needed";
}

export function assignedVisitFieldStatusFromCommercialAction(
  action: OpportunityAction,
): string {
  switch (action.kind) {
    case "START_QUOTE":
    case "OPEN_DRAFT_QUOTE":
    case "OPEN_QUOTE":
    case "SEND_QUOTE":
      return "Quote ready for office review";
    case "FOLLOW_UP_CUSTOMER":
      return "Follow-up needed";
    case "EDIT_CONTACT_INFO":
      return "Missing info recorded";
    case "CREATE_REVISION_DRAFT":
    case "OPEN_EXECUTION_REVIEW":
    case "OPEN_JOB":
    case "REVIEW_CUSTOMER_MATCH":
    case "RESUME_OPPORTUNITY":
      return "Visit complete — office follow-up needed";
    case "SCHEDULE_SALES_VISIT":
      return "Follow-up needed";
    default:
      return "Visit complete — office follow-up needed";
  }
}

function pickPrimaryAssignedVisit(visits: AssignedVisitSurfaceVisitInput[]) {
  return (
    visits.find((visit) => visit.status === LeadVisitRequestStatus.CONFIRMED) ??
    visits.find((visit) => visit.status === LeadVisitRequestStatus.PENDING) ??
    visits.find((visit) => visit.status === LeadVisitRequestStatus.COMPLETED) ??
    visits.find((visit) => visit.status === LeadVisitRequestStatus.NO_SHOW) ??
    null
  );
}

function resolveAssignedFieldStatusLine(input: {
  flow: OpportunityFlowView;
  visits: AssignedVisitSurfaceVisitInput[];
  blockedPrimary: OpportunityAction | null;
}): string | null {
  const primaryVisit = pickPrimaryAssignedVisit(input.visits);
  const fromVisit =
    primaryVisit != null ? assignedVisitFieldStatusFromOutcome(primaryVisit) : null;
  if (fromVisit) return fromVisit;

  if (input.blockedPrimary && !isAssignedVisitFieldAction(input.blockedPrimary.kind)) {
    return assignedVisitFieldStatusFromCommercialAction(input.blockedPrimary);
  }

  const hasFieldPrimary = input.flow.primaryAction != null;
  const hasFieldSecondary = input.flow.secondaryActions.length > 0;
  if (hasFieldPrimary || hasFieldSecondary) return null;

  if (
    primaryVisit?.status === LeadVisitRequestStatus.COMPLETED ||
    primaryVisit?.status === LeadVisitRequestStatus.NO_SHOW
  ) {
    return assignedVisitFieldStatusFromOutcome(primaryVisit) ?? "Visit complete — office follow-up needed";
  }

  return null;
}

function visitNeedsCompletionAction(visit: AssignedVisitSurfaceVisitInput): boolean {
  if (visit.status === LeadVisitRequestStatus.CONFIRMED) return true;
  if (visit.status === LeadVisitRequestStatus.COMPLETED) {
    return visit.outcome == null || visit.nextAction == null;
  }
  if (visit.status === LeadVisitRequestStatus.NO_SHOW) {
    return visit.outcome == null || visit.nextAction == null;
  }
  return false;
}

function shouldIncludeAssignedFieldAction(
  action: OpportunityAction,
  visits: AssignedVisitSurfaceVisitInput[],
): boolean {
  if (!isAssignedVisitFieldAction(action.kind)) return false;

  const targetVisit =
    (action.targetVisitRequestId
      ? visits.find((visit) => visit.id === action.targetVisitRequestId)
      : null) ?? pickPrimaryAssignedVisit(visits);

  if (action.kind === "COMPLETE_SALES_VISIT") {
    return targetVisit != null && visitNeedsCompletionAction(targetVisit);
  }

  if (action.kind === "SCHEDULE_SALES_VISIT") {
    return (
      targetVisit?.status === LeadVisitRequestStatus.PENDING ||
      targetVisit?.status === LeadVisitRequestStatus.NO_SHOW
    );
  }

  return true;
}

export function presentOpportunityFlowForAssignedVisitSurface(
  flow: OpportunityFlowView,
  visits: AssignedVisitSurfaceVisitInput[],
): OpportunityFlowView & { assignedFieldStatusLine: string | null } {
  const blockedPrimary =
    flow.primaryAction && !shouldIncludeAssignedFieldAction(flow.primaryAction, visits)
      ? flow.primaryAction
      : null;

  const primaryAction =
    flow.primaryAction && shouldIncludeAssignedFieldAction(flow.primaryAction, visits)
      ? flow.primaryAction
      : null;

  const secondaryActions = flow.secondaryActions.filter((action) =>
    shouldIncludeAssignedFieldAction(action, visits),
  );

  const assignedFieldStatusLine = resolveAssignedFieldStatusLine({
    flow: { ...flow, primaryAction, secondaryActions },
    visits,
    blockedPrimary,
  });

  const summary =
    assignedFieldStatusLine &&
    blockedPrimary &&
    !primaryAction &&
    secondaryActions.length === 0
      ? assignedFieldStatusLine
      : flow.summary;

  return {
    ...flow,
    summary,
    primaryAction,
    secondaryActions,
    requirements: flow.requirements.filter((requirement) => {
      const normalized = requirement.trim().toLowerCase();
      if (normalized.includes("quote")) return false;
      if (normalized.includes("customer match")) return false;
      if (normalized.includes("send")) return false;
      return true;
    }),
    assignedFieldStatusLine,
  };
}
