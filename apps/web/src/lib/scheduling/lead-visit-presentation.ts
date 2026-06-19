import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
} from "@prisma/client";
import { formatLeadVisitStatusLabel } from "./lead-visit-schedule-service";

export const LEAD_VISIT_OUTCOME_LABELS: Record<LeadVisitOutcome, string> = {
  QUOTE_READY: "Quote ready",
  QUOTE_NEEDS_REVISION: "Quote needs revision",
  MISSING_INFORMATION: "Missing information",
  FOLLOW_UP_NEEDED: "Follow-up needed",
  CUSTOMER_NO_SHOW: "Customer no-show",
  CONTRACTOR_MISSED: "Contractor missed",
  RESCHEDULE_NEEDED: "Reschedule needed",
  DISQUALIFIED: "Disqualified",
};

export const LEAD_VISIT_NEXT_ACTION_LABELS: Record<LeadVisitNextAction, string> = {
  START_QUOTE: "Start quote",
  OPEN_OR_REVISE_QUOTE: "Open or revise quote",
  COLLECT_MISSING_INFO: "Collect missing info",
  FOLLOW_UP_CUSTOMER: "Follow up with customer",
  SCHEDULE_ANOTHER_VISIT: "Schedule another visit",
  CLOSE_OR_DISQUALIFY: "Close or disqualify",
  NONE_REQUIRED: "None required",
};

export function formatLeadVisitOutcomeLabel(outcome: LeadVisitOutcome): string {
  return LEAD_VISIT_OUTCOME_LABELS[outcome];
}

export function formatLeadVisitNextActionLabel(nextAction: LeadVisitNextAction): string {
  return LEAD_VISIT_NEXT_ACTION_LABELS[nextAction];
}

export { formatLeadVisitStatusLabel };

export function leadVisitStatusBadgeTone(
  status: LeadVisitRequestStatus,
): "neutral" | "sent" | "warning" | "danger" {
  if (status === LeadVisitRequestStatus.CONFIRMED) return "sent";
  if (status === LeadVisitRequestStatus.PENDING) return "warning";
  if (status === LeadVisitRequestStatus.NO_SHOW) return "danger";
  if (status === LeadVisitRequestStatus.COMPLETED) return "neutral";
  return "neutral";
}
