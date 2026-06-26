import type {
  ApprovedCommercialLineItem,
  LineItemDetailSuggestion,
  OptionalAddOnSuggestion,
} from "./quote-line-items-proposal-schema";

export const QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER = "Quick scope capture job context:";

export type PersistedCommercialLineFields = {
  description: string;
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  internalNotes: string | null;
};

function formatDetailLine(detail: LineItemDetailSuggestion): string {
  const label = detail.label?.trim();
  const prefix = label ? `${label}: ` : "- ";
  return `${prefix}${detail.content.trim()}`;
}

function isCustomerFacing(audience: LineItemDetailSuggestion["audience"]): boolean {
  return audience === "customer" || audience === "both";
}

/**
 * Maps a grouped commercial scope suggestion to persisted QuoteLineItem fields.
 * Pricing is always applied separately (qty 1, $0).
 */
export function mapCommercialSuggestionToLineFields(
  item: ApprovedCommercialLineItem,
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

  const internalSections: string[] = [];
  if (internalDetailLines.length > 0) {
    internalSections.push(`Line-specific details:\n${internalDetailLines.join("\n")}`);
  }
  if (item.executionPlanningNotes.length > 0) {
    const notes = item.executionPlanningNotes.map((n) => `- ${n.trim()}`).join("\n");
    internalSections.push(`Execution planning notes:\n${notes}`);
  }

  const customerScopeDescription =
    item.customerScopeDescription?.trim() ||
    (customerDetailLines.length > 0 ? customerDetailLines.join("\n") : null);

  const customerIncludedNotes =
    customerDetailLines.length > 0 && item.customerScopeDescription?.trim()
      ? customerDetailLines.join("\n")
      : null;

  return {
    description: item.description.trim(),
    customerScopeTitle: item.customerScopeTitle?.trim() || null,
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
  const items = newItems.map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) {
    const trimmed = existingNotes?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
  }

  const bullets = items.map((item) => `- ${item}`).join("\n");
  const block = `${QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER}\n${bullets}`;
  const existing = existingNotes?.trim() ?? "";

  if (!existing) {
    return block;
  }
  if (existing.includes(QUOTE_SCOPE_CAPTURE_JOB_CONTEXT_HEADER)) {
    return `${existing}\n${bullets}`;
  }
  return `${existing}\n\n${block}`;
}
