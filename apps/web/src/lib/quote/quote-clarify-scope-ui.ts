/**
 * Pure helpers for Clarify Scope primary UI labels (Slice 2A).
 * Safe to unit test without React.
 */

/** Main quote-tab readiness section — not deprecated "Scope details needed". */
export const QUOTE_SEND_READINESS_HEADING = "Before sending";

export const QUOTE_SEND_READINESS_READY_COPY =
  "Scope, jobsite, and payment terms look ready. Send when commercially complete.";

export const LEGACY_GAP_HANDLING_LABEL = "Legacy gap handling";

export const LEGACY_GAP_HANDLING_DESCRIPTION =
  "Temporary compatibility only. Use Clarify scope to capture quote truth. These controls clear older internal gap records until the next cleanup slice.";

/** Line-level primary Clarify action label. */
export function lineClarifyActionLabel(sendBlockingCount: number): string {
  if (sendBlockingCount > 0) {
    return sendBlockingCount === 1 ? "Clarify (1)" : `Clarify (${sendBlockingCount})`;
  }
  return "Clarify scope";
}

/** True when legacy compatibility controls should remain available. */
export function shouldShowLegacyGapHandling(openDecisionCount: number): boolean {
  return openDecisionCount > 0;
}

/** Deprecated panel title — must not be used as primary UX copy. */
export const DEPRECATED_SCOPE_DETAILS_NEEDED_TITLE = "Scope details needed";

export function isDeprecatedScopeDetailsNeededTitle(title: string): boolean {
  return title.trim().toLowerCase().startsWith("scope details needed");
}
