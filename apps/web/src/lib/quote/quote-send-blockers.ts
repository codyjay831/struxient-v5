import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionResolutionTiming,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";

export type QuoteSendBlockerSeverity = "blocking" | "warning";

export type QuoteSendBlockerCode =
  | "NO_LINE_ITEMS"
  | "MISSING_JOBSITE"
  | "PAYMENT_PLAN_REQUIRED"
  | "PAYMENT_PLAN_INVALID"
  | "REQUIRED_SCOPE_GAP_OPEN"
  | "QUOTE_STATUS_NOT_SENDABLE"
  | "UNKNOWN";

export type QuoteSendBlockerActionTarget = "clarify" | "payments" | "quote" | "jobsite";

export type QuoteSendBlocker = {
  code: QuoteSendBlockerCode;
  severity: QuoteSendBlockerSeverity;
  message: string;
  quoteLineItemId?: string | null;
  scopeDecisionId?: string | null;
  actionLabel?: string;
  actionTarget?: QuoteSendBlockerActionTarget;
};

export type QuoteSendBlockerResult = {
  canSend: boolean;
  blockers: QuoteSendBlocker[];
  warnings: QuoteSendBlocker[];
};

/** Minimal scope decision fields needed for send-blocker derivation. */
export type QuoteSendBlockerScopeDecision = {
  id: string;
  quoteLineItemId: string | null;
  status: QuoteScopeDecisionStatus;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  resolutionTiming?: QuoteScopeDecisionResolutionTiming | null;
  title?: string;
};

export type QuoteSendBlockerInput = {
  status: QuoteStatus;
  lineItemCount: number;
  serviceLocationId: string | null;
  paymentScheduleItemCount: number;
  scopeDecisions?: readonly QuoteSendBlockerScopeDecision[];
};

export function isSendBlockingScopeDecision(
  decision: QuoteSendBlockerScopeDecision,
): boolean {
  if (decision.status !== QuoteScopeDecisionStatus.OPEN) {
    return false;
  }

  if (
    decision.quoteImpact === QuoteScopeDecisionQuoteImpact.REQUIRED ||
    decision.quoteImpact === QuoteScopeDecisionQuoteImpact.POSSIBLE
  ) {
    return true;
  }

  return false;
}

export function countSendBlockingScopeDecisions(
  decisions: readonly QuoteSendBlockerScopeDecision[],
): number {
  return decisions.filter(isSendBlockingScopeDecision).length;
}

function scopeGapMessage(decision: QuoteSendBlockerScopeDecision): string {
  const title = decision.title?.trim();
  if (title) {
    return `Clarify scope before sending: ${title}`;
  }
  return "Clarify scope before sending — unresolved quote gap.";
}

function buildScopeGapBlockers(
  decisions: readonly QuoteSendBlockerScopeDecision[],
): QuoteSendBlocker[] {
  return decisions.filter(isSendBlockingScopeDecision).map((decision) => ({
    code: "REQUIRED_SCOPE_GAP_OPEN",
    severity: "blocking" as const,
    message: scopeGapMessage(decision),
    quoteLineItemId: decision.quoteLineItemId,
    scopeDecisionId: decision.id,
    actionLabel: "Clarify scope",
    actionTarget: "clarify" as const,
  }));
}

function buildDeferredScopeWarnings(
  decisions: readonly QuoteSendBlockerScopeDecision[],
): QuoteSendBlocker[] {
  return decisions
    .filter((d) => d.status === QuoteScopeDecisionStatus.DEFERRED)
    .map((decision) => ({
      code: "UNKNOWN" as const,
      severity: "warning" as const,
      message: decision.title?.trim()
        ? `Deferred to execution: ${decision.title.trim()}`
        : "Deferred scope gap — does not block send.",
      quoteLineItemId: decision.quoteLineItemId,
      scopeDecisionId: decision.id,
      actionLabel: "Plan work (internal)",
      actionTarget: "quote" as const,
    }));
}

/**
 * Canonical derived send blockers for draft quotes.
 * Pure — safe to unit test; consumed by server send gate and workflow UI.
 */
export function buildQuoteSendBlockers(
  input: QuoteSendBlockerInput,
): QuoteSendBlockerResult {
  const blockers: QuoteSendBlocker[] = [];
  const scopeDecisions = input.scopeDecisions ?? [];

  if (input.status !== QuoteStatus.DRAFT) {
    blockers.push({
      code: "QUOTE_STATUS_NOT_SENDABLE",
      severity: "blocking",
      message: "Only draft quotes can be sent. Refresh and try again.",
      actionTarget: "quote",
    });
    return { canSend: false, blockers, warnings: [] };
  }

  if (input.lineItemCount === 0) {
    blockers.push({
      code: "NO_LINE_ITEMS",
      severity: "blocking",
      message: "Add at least one scope line item before sending.",
      actionLabel: "Add line item",
      actionTarget: "quote",
    });
  }

  if (!input.serviceLocationId) {
    blockers.push({
      code: "MISSING_JOBSITE",
      severity: "blocking",
      message: "Add a jobsite address before sending.",
      actionLabel: "Add jobsite",
      actionTarget: "jobsite",
    });
  }

  if (input.paymentScheduleItemCount === 0) {
    blockers.push({
      code: "PAYMENT_PLAN_REQUIRED",
      severity: "blocking",
      message: "Define payment terms before sending.",
      actionLabel: "Payment terms",
      actionTarget: "payments",
    });
  }

  blockers.push(...buildScopeGapBlockers(scopeDecisions));

  const warnings = buildDeferredScopeWarnings(scopeDecisions);

  return {
    canSend: blockers.length === 0,
    blockers,
    warnings,
  };
}

/** First blocking message — suitable for server action error strings. */
export function primaryQuoteSendBlockerMessage(
  result: QuoteSendBlockerResult,
): string | null {
  const scopeBlockers = result.blockers.filter(
    (b) => b.code === "REQUIRED_SCOPE_GAP_OPEN",
  );

  if (scopeBlockers.length === 1) {
    return scopeBlockers[0]!.message;
  }

  if (scopeBlockers.length > 1) {
    return `Clarify ${scopeBlockers.length} scope gaps before sending.`;
  }

  return result.blockers[0]?.message ?? null;
}
