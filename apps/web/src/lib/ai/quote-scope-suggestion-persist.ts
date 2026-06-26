import type {
  ApprovedCommercialLineItem,
  LineItemDetailSuggestion,
  OptionalAddOnSuggestion,
} from "./quote-line-items-proposal-schema";
import { sanitizeQuickScopeLineTitle } from "./quick-scope-title-guardrails";

export const QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER = "Quick scope capture job context:";
export const QUICK_SCOPE_INTERNAL_OBSERVATIONS_HEADER =
  "Quick scope observations (internal):";

export type PersistedCommercialLineFields = {
  description: string;
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  internalNotes: string | null;
};

const CUSTOMER_SCOPE_FORBIDDEN_PHRASES: readonly RegExp[] = [
  /\bmissing info\b/i,
  /\bmissing[-\s]?information\b/i,
  /\bscope gap(s)?\b/i,
  /\bgap(s)?\b/i,
  /\buncertain(ty)?\b/i,
  /\binternal ai\b/i,
];

const CUSTOMER_SCOPE_MARKETING_LABELS: readonly RegExp[] = [
  /\[[^\]]+\]/gi,
  /\((?:[^)]*(?:smart system|premium|best value|advanced package|complete system|elite)[^)]*)\)/gi,
];

function removeBlock(text: string, header: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]?.trim() === header) {
      i += 1;
      while (i < lines.length && lines[i]?.trim() !== "") {
        i += 1;
      }
      if (i < lines.length && lines[i]?.trim() === "") {
        i += 1;
      }
      continue;
    }
    out.push(lines[i] ?? "");
    i += 1;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mergeInternalBulletBlock(
  existing: string | null | undefined,
  header: string,
  values: readonly string[],
): string | null {
  const base = removeBlock((existing ?? "").trim(), header);
  const deduped = [...new Set(values.map((item) => item.trim()).filter(Boolean))];
  if (deduped.length === 0) {
    return base.length > 0 ? base : null;
  }
  const block = `${header}\n${deduped.map((item) => `- ${item}`).join("\n")}`;
  if (!base) return block;
  return `${base}\n\n${block}`;
}

function formatDetailLine(detail: LineItemDetailSuggestion): string {
  const label = detail.label?.trim();
  const prefix = label ? `${label}: ` : "- ";
  return `${prefix}${detail.content.trim()}`;
}

function isCustomerFacing(audience: LineItemDetailSuggestion["audience"]): boolean {
  return audience === "customer" || audience === "both";
}

function sanitizeCustomerFacingText(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = CUSTOMER_SCOPE_MARKETING_LABELS.reduce(
    (next, pattern) => next.replace(pattern, " "),
    value,
  );
  const trimmed = stripped.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  if (CUSTOMER_SCOPE_FORBIDDEN_PHRASES.some((pattern) => pattern.test(trimmed))) {
    return "Final selections and field conditions must be confirmed before material order or installation.";
  }
  return trimmed;
}

/**
 * Maps a grouped commercial scope suggestion to persisted QuoteLineItem fields.
 * Pricing is always applied separately (qty 1, $0).
 */
export function mapCommercialSuggestionToLineFields(
  item: ApprovedCommercialLineItem,
  options?: { sourceGroundingText?: string | null },
): PersistedCommercialLineFields {
  const internalDetailLines: string[] = [];
  const customerDetailLines: string[] = [];

  for (const detail of item.lineItemDetails) {
    const line = formatDetailLine(detail);
    if (isCustomerFacing(detail.audience)) {
      customerDetailLines.push(line);
    } else {
      internalDetailLines.push(line);
    }
  }

  const hiddenObservations = item.missingInfo
    .map((observation) => observation.trim())
    .filter(Boolean);

  const internalSections: string[] = [];
  if (internalDetailLines.length > 0) {
    internalSections.push(`Line-specific details:\n${internalDetailLines.join("\n")}`);
  }
  if (item.executionPlanningNotes.length > 0) {
    const notes = item.executionPlanningNotes.map((n) => `- ${n.trim()}`).join("\n");
    internalSections.push(`Execution planning notes:\n${notes}`);
  }
  if (hiddenObservations.length > 0) {
    internalSections.push(
      `${QUICK_SCOPE_INTERNAL_OBSERVATIONS_HEADER}\n${hiddenObservations
        .map((note) => `- ${note}`)
        .join("\n")}`,
    );
  }

  const customerScopeDescription = sanitizeCustomerFacingText(
    item.customerScopeDescription?.trim() ||
      (customerDetailLines.length > 0 ? customerDetailLines.join("\n") : null),
  );

  const customerIncludedNotes = sanitizeCustomerFacingText(
    customerDetailLines.length > 0 && item.customerScopeDescription?.trim()
      ? customerDetailLines.join("\n")
      : null,
  );

  const safeDescription = sanitizeQuickScopeLineTitle(item.description.trim(), {
    groundingText: options?.sourceGroundingText,
  });
  const safeCustomerScopeTitle = item.customerScopeTitle
    ? sanitizeQuickScopeLineTitle(item.customerScopeTitle.trim(), {
        groundingText: options?.sourceGroundingText,
      })
    : null;

  return {
    description: safeDescription,
    customerScopeTitle: sanitizeCustomerFacingText(safeCustomerScopeTitle),
    customerScopeDescription,
    customerIncludedNotes,
    internalNotes: internalSections.length > 0 ? internalSections.join("\n\n") : null,
  };
}

/**
 * Optional add-ons become separate line rows with minimal fields.
 */
export function mapOptionalAddOnToLineFields(
  addOn: Pick<OptionalAddOnSuggestion, "description" | "whySeparate">,
): PersistedCommercialLineFields {
  return {
    description: addOn.description.trim(),
    customerScopeTitle: null,
    customerScopeDescription: null,
    customerIncludedNotes: null,
    internalNotes: `Optional add-on rationale:\n${addOn.whySeparate.trim()}`,
  };
}

/**
 * Appends selected job-wide context bullets to quote internal notes.
 */
export function appendQuoteJobContextToQuoteInternalNotes(
  existingNotes: string | null | undefined,
  newItems: readonly string[],
): string | null {
  return mergeInternalBulletBlock(
    existingNotes,
    QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER,
    newItems,
  );
}

export function appendQuickScopeObservationsToQuoteInternalNotes(
  existingNotes: string | null | undefined,
  observations: readonly string[],
): string | null {
  return mergeInternalBulletBlock(
    existingNotes,
    QUICK_SCOPE_INTERNAL_OBSERVATIONS_HEADER,
    observations,
  );
}
