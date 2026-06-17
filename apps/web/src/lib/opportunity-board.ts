import type { OpportunityConditionCode, OpportunityPhase } from "@/lib/opportunity-flow";

/** Broad orientation phases — card context, not primary board columns. */
export const OPPORTUNITY_PHASE_ORDER = [
  "INTAKE",
  "DISCOVERY",
  "ESTIMATING",
  "CUSTOMER_REVIEW",
  "WON",
] as const satisfies readonly OpportunityPhase[];

export function formatOpportunityPhaseLabel(phase: OpportunityPhase | string): string {
  switch (phase) {
    case "INTAKE":
      return "Intake";
    case "DISCOVERY":
      return "Discovery";
    case "ESTIMATING":
      return "Estimating";
    case "CUSTOMER_REVIEW":
      return "Customer review";
    case "WON":
      return "Won";
    case "LOST":
      return "Lost";
    case "PAUSED":
      return "Paused";
    default:
      return phase;
  }
}

/** Actionable Sales board lanes derived from condition codes. */
export type SalesBoardLane =
  | "NEEDS_INFO"
  | "CUSTOMER_MATCH_REVIEW"
  | "NEEDS_SITE_SURVEY"
  | "SITE_SURVEY_SET"
  | "READY_TO_QUOTE"
  | "QUOTE_DRAFT"
  | "QUOTE_SENT"
  | "CHANGES_REQUESTED"
  | "APPROVED_READY_FOR_JOB"
  | "JOB_ACTIVE"
  | "PAUSED"
  | "LOST";

export const SALES_BOARD_LANE_ORDER: SalesBoardLane[] = [
  "NEEDS_INFO",
  "CUSTOMER_MATCH_REVIEW",
  "NEEDS_SITE_SURVEY",
  "SITE_SURVEY_SET",
  "READY_TO_QUOTE",
  "QUOTE_DRAFT",
  "QUOTE_SENT",
  "CHANGES_REQUESTED",
  "APPROVED_READY_FOR_JOB",
  "JOB_ACTIVE",
  "PAUSED",
  "LOST",
];

/** Lanes shown for the default Active pipeline filter. */
export const SALES_BOARD_ACTIVE_LANES: SalesBoardLane[] = SALES_BOARD_LANE_ORDER.filter(
  (lane) =>
    lane !== "APPROVED_READY_FOR_JOB" &&
    lane !== "JOB_ACTIVE" &&
    lane !== "LOST",
);

/** Lanes shown for the Awarded pipeline filter. */
export const SALES_BOARD_AWARDED_LANES: SalesBoardLane[] = [
  "APPROVED_READY_FOR_JOB",
  "JOB_ACTIVE",
];

/** Lanes shown for the Closed pipeline filter. */
export const SALES_BOARD_CLOSED_LANES: SalesBoardLane[] = ["LOST"];

export function formatSalesBoardLaneLabel(lane: SalesBoardLane): string {
  switch (lane) {
    case "NEEDS_INFO":
      return "Needs info";
    case "CUSTOMER_MATCH_REVIEW":
      return "Customer match review";
    case "NEEDS_SITE_SURVEY":
      return "Needs site survey";
    case "SITE_SURVEY_SET":
      return "Site survey set";
    case "READY_TO_QUOTE":
      return "Ready to quote";
    case "QUOTE_DRAFT":
      return "Quote draft";
    case "QUOTE_SENT":
      return "Quote sent";
    case "CHANGES_REQUESTED":
      return "Changes requested";
    case "APPROVED_READY_FOR_JOB":
      return "Approved / ready for job";
    case "JOB_ACTIVE":
      return "Job active";
    case "PAUSED":
      return "Paused";
    case "LOST":
      return "Lost";
  }
}

export function getSalesBoardLaneForCondition(
  conditionCode: OpportunityConditionCode,
): SalesBoardLane {
  switch (conditionCode) {
    case "NEEDS_INTAKE_DETAILS":
      return "NEEDS_INFO";
    case "CUSTOMER_MATCH_NEEDS_REVIEW":
      return "CUSTOMER_MATCH_REVIEW";
    case "NEEDS_SALES_VISIT":
    case "FOLLOW_UP_VISIT_REQUIRED":
      return "NEEDS_SITE_SURVEY";
    case "SALES_VISIT_SCHEDULED":
      return "SITE_SURVEY_SET";
    case "READY_TO_QUOTE":
      return "READY_TO_QUOTE";
    case "QUOTE_DRAFT_IN_PROGRESS":
    case "QUOTE_READY_TO_SEND":
    case "REVISION_DRAFT_IN_PROGRESS":
    case "REVISION_READY_TO_SEND":
      return "QUOTE_DRAFT";
    case "WAITING_ON_CUSTOMER":
      return "QUOTE_SENT";
    case "CUSTOMER_REQUESTED_CHANGES":
      return "CHANGES_REQUESTED";
    case "APPROVED_READY_FOR_JOB":
      return "APPROVED_READY_FOR_JOB";
    case "JOB_ACTIVE":
      return "JOB_ACTIVE";
    case "PAUSED":
      return "PAUSED";
    case "LOST":
      return "LOST";
  }
}

export function salesBoardLanesForPipeline(
  pipeline: "active" | "awarded" | "closed",
): SalesBoardLane[] {
  switch (pipeline) {
    case "awarded":
      return SALES_BOARD_AWARDED_LANES;
    case "closed":
      return SALES_BOARD_CLOSED_LANES;
    case "active":
    default:
      return SALES_BOARD_ACTIVE_LANES;
  }
}

export function groupRowsBySalesBoardLane<T extends { progressState: string }>(
  rows: T[],
  getConditionCode: (row: T) => OpportunityConditionCode = (row) =>
    row.progressState as OpportunityConditionCode,
): Map<SalesBoardLane, T[]> {
  const grouped = new Map<SalesBoardLane, T[]>();
  for (const row of rows) {
    const lane = getSalesBoardLaneForCondition(getConditionCode(row));
    const bucket = grouped.get(lane);
    if (bucket) bucket.push(row);
    else grouped.set(lane, [row]);
  }
  return grouped;
}

/** Sort rows within a lane by condition age (oldest first). */
export function sortRowsByConditionAge<T extends { opportunityFlow: { conditionStartedAt: string | null } }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aTime = a.opportunityFlow.conditionStartedAt
      ? new Date(a.opportunityFlow.conditionStartedAt).getTime()
      : 0;
    const bTime = b.opportunityFlow.conditionStartedAt
      ? new Date(b.opportunityFlow.conditionStartedAt).getTime()
      : 0;
    return aTime - bTime;
  });
}
