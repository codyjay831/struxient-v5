/**
 * Pure helpers for Clarify Scope primary UI labels (Slice 2A).
 * Safe to unit test without React.
 */

/** Main quote-tab readiness section — not deprecated "Scope details needed". */
export const QUOTE_SEND_READINESS_HEADING = "Before sending";

export const QUOTE_SEND_READINESS_READY_COPY =
  "Scope, jobsite, and payment terms look ready. Send when commercially complete.";

/** Line-level primary Clarify action label. */
export function lineClarifyActionLabel(sendBlockingCount: number): string {
  if (sendBlockingCount > 0) {
    return sendBlockingCount === 1 ? "Clarify (1)" : `Clarify (${sendBlockingCount})`;
  }
  return "Clarify scope";
}
