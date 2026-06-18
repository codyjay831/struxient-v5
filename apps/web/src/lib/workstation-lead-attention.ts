import type { OpportunityConditionCode } from "./opportunity-flow";

export type LeadWorkstationAttentionGroup =
  | "investigate"
  | "ready"
  | "waiting"
  | "blocked"
  | "active"
  | "scheduled";

export type LeadWorkstationAttentionPriority = "critical" | "high" | "medium" | "low";

export function classifyLeadWorkstationAttention(input: {
  conditionCode: OpportunityConditionCode;
  hasPendingVisit: boolean;
}): {
  group: LeadWorkstationAttentionGroup;
  priority: LeadWorkstationAttentionPriority;
} {
  if (input.hasPendingVisit) {
    return { group: "investigate", priority: "critical" };
  }

  switch (input.conditionCode) {
    case "CUSTOMER_MATCH_NEEDS_REVIEW":
    case "NEEDS_INTAKE_DETAILS":
    case "NEEDS_SALES_VISIT":
    case "FOLLOW_UP_VISIT_REQUIRED":
    case "SALES_VISIT_SCHEDULED":
      return { group: "investigate", priority: "high" };
    case "READY_TO_QUOTE":
      return { group: "ready", priority: "high" };
    case "PAUSED":
    case "WAITING_ON_CUSTOMER":
      return { group: "waiting", priority: "low" };
    default:
      return { group: "ready", priority: "medium" };
  }
}

export function leadShouldAppearInBoardAttention(input: {
  kind: "lead";
  group: LeadWorkstationAttentionGroup;
  priority: LeadWorkstationAttentionPriority;
  isBlocked?: boolean;
  isWaitingOnSignals?: boolean;
}): boolean {
  if (input.isWaitingOnSignals) return false;
  if (input.isBlocked) return true;
  if (input.group === "investigate" || input.group === "blocked") return true;
  return input.kind === "lead" && input.group === "ready" && input.priority === "high";
}
