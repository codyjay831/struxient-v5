/**
 * Pure helpers for draft execution secondary UI (Slice 5).
 * Safe to unit test without React.
 */

/** Collapsed line-level action — internal planning only. */
export const QUOTE_DRAFT_EXECUTION_ACTION_LABEL = "Plan work (internal)";

/** Expanded panel heading — not customer-facing execution truth. */
export const QUOTE_DRAFT_EXECUTION_PANEL_HEADING = "Internal work plan";

export const QUOTE_DRAFT_EXECUTION_INTERNAL_COPY =
  "Internal planning only — not shown on the customer quote.";

export const QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY =
  "Draft tasks are confirmed later during execution setup.";

/** Line-level open action — same label whether or not tasks exist. */
export function quoteDraftExecutionActionLabel(): string {
  return QUOTE_DRAFT_EXECUTION_ACTION_LABEL;
}

/** True when draft execution panel should start collapsed (default UX). */
export function quoteDraftExecutionDefaultExpanded(hasExecutionReviewFocus: boolean): boolean {
  return hasExecutionReviewFocus;
}
