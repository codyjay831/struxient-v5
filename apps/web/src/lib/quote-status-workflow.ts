import { QuoteStatus } from "@prisma/client";

/** Quote rows in these states allow editing internal draft execution (pre-activation). */
export const QUOTE_STATUSES_EXECUTION_EDITABLE: readonly QuoteStatus[] = [
  QuoteStatus.DRAFT,
  QuoteStatus.SENT,
  QuoteStatus.APPROVED,
];

/** Commercial fields and line items: only while actively drafting. */
export function quoteStatusAllowsCommercialEdits(status: QuoteStatus): boolean {
  return status === QuoteStatus.DRAFT;
}

/** Internal draft execution and planning: allowed until archive (pre-activation). */
export function quoteStatusAllowsExecutionEdits(status: QuoteStatus): boolean {
  return QUOTE_STATUSES_EXECUTION_EDITABLE.includes(status);
}

/** Quote-line draft execution may be edited until a runtime job exists for the quote. */
export function quoteAllowsQuoteLineExecutionPlanning(
  status: QuoteStatus,
  hasActivatedJob: boolean,
): boolean {
  if (hasActivatedJob) {
    return false;
  }
  return quoteStatusAllowsExecutionEdits(status);
}

export function quoteStatusIsArchived(status: QuoteStatus): boolean {
  return status === QuoteStatus.ARCHIVED;
}

export function quoteStatusIsSent(status: QuoteStatus): boolean {
  return status === QuoteStatus.SENT;
}

export function quoteStatusIsApproved(status: QuoteStatus): boolean {
  return status === QuoteStatus.APPROVED;
}
