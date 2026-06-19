import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";

const TITLE_PREFIX_PATTERN =
  /^(confirm|verify|measure|determine|identify|check|validate|assess|clarify)\s+/i;

/** Quote-wide open/deferred scope decisions. */
export function filterQuoteWideScopeDecisions(
  decisions: readonly QuoteScopeDecisionPayload[],
): QuoteScopeDecisionPayload[] {
  return decisions.filter((d) => d.quoteLineItemId == null);
}

/** Line-scoped open/deferred scope decisions for one quote line. */
export function filterLineScopeDecisions(
  decisions: readonly QuoteScopeDecisionPayload[],
  lineId: string,
): QuoteScopeDecisionPayload[] {
  return decisions.filter((d) => d.quoteLineItemId === lineId);
}

/** Short chip label derived from a scope decision title. */
export function scopeDecisionPreviewChip(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return "Detail";

  const withoutPrefix = trimmed.replace(TITLE_PREFIX_PATTERN, "").trim();
  const source = withoutPrefix || trimmed;
  const words = source.split(/\s+/).filter(Boolean);

  if (words.length <= 3 && source.length <= 28) {
    return source;
  }

  const shortened = words.slice(0, 3).join(" ");
  return shortened.length > 28 ? `${shortened.slice(0, 25).trim()}…` : shortened;
}

/** Preview chips for compact UI — deduped by label, capped. */
export function buildScopeDecisionPreviewChips(
  decisions: readonly QuoteScopeDecisionPayload[],
  maxChips = 4,
): string[] {
  const seen = new Set<string>();
  const chips: string[] = [];

  for (const decision of decisions) {
    const chip = scopeDecisionPreviewChip(decision.title);
    const key = chip.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(chip);
    if (chips.length >= maxChips) break;
  }

  return chips;
}

/** Human-readable strings for Clarify Scope AI context. */
export function formatScopeDecisionForAiContext(
  decision: Pick<QuoteScopeDecisionPayload, "title" | "detail">,
): string {
  const title = decision.title.trim();
  const detail = decision.detail?.trim();
  if (!title) return "";
  if (!detail) return title;
  return `${title} — ${detail}`;
}
