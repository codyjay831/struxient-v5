import type {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionResolutionTiming,
  QuoteScopeDecisionSourceType,
  QuoteScopeDecisionStatus,
} from "@prisma/client";

/** Serializable scope decision for quote workspace UI. */
export type QuoteScopeDecisionPayload = {
  id: string;
  quoteId: string;
  quoteLineItemId: string | null;
  sourceType: QuoteScopeDecisionSourceType;
  title: string;
  detail: string | null;
  status: QuoteScopeDecisionStatus;
  resolutionTiming: QuoteScopeDecisionResolutionTiming | null;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
};

export type QuoteScopeDecisionManualAction =
  | "resolve"
  | "ask_customer"
  | "verify_on_site"
  | "defer_to_execution"
  | "use_assumption"
  | "dismiss";

export const QUOTE_SCOPE_DECISION_ACTIVE_STATUSES: readonly QuoteScopeDecisionStatus[] = [
  "OPEN",
  "DEFERRED",
];

export function isActiveQuoteScopeDecisionStatus(
  status: QuoteScopeDecisionStatus,
): boolean {
  return status === "OPEN" || status === "DEFERRED";
}

export function formatQuoteScopeDecisionResolutionTiming(
  timing: QuoteScopeDecisionResolutionTiming | null,
): string | null {
  if (!timing) return null;
  const labels: Record<QuoteScopeDecisionResolutionTiming, string> = {
    BEFORE_QUOTE: "Before quote",
    ASK_CUSTOMER: "Ask customer",
    SITE_VISIT: "Verify on site",
    EXECUTION: "Defer to execution",
    ASSUMPTION: "Assumption",
    NOT_NEEDED: "Not needed",
  };
  return labels[timing];
}

export function formatQuoteScopeDecisionStatus(
  status: QuoteScopeDecisionStatus,
): string {
  const labels: Record<QuoteScopeDecisionStatus, string> = {
    OPEN: "Open",
    RESOLVED: "Resolved",
    DISMISSED: "Dismissed",
    DEFERRED: "Deferred",
  };
  return labels[status];
}
