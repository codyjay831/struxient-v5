/** Shared caps for quote draft form fields (server + client maxLength). */
export const QUOTE_FIELD_LIMITS = {
  title: 500,
  internalNotes: 20_000,
  customerDocumentTitle: 500,
} as const;

export const QUOTE_LINE_FIELD_LIMITS = {
  description: 2000,
  internalNotes: 10_000,
} as const;

/** Optional proposal wording fields on quotes and line items (trimmed empty → null). */
export const QUOTE_PROPOSAL_FIELD_LIMITS = {
  customerScopeTitle: 500,
  customerScopeDescription: 10_000,
  customerIncludedNotes: 5000,
  customerExcludedNotes: 5000,
  customerPresentationGroup: 200,
} as const;

export const QUOTE_PAYMENT_SCHEDULE_FIELD_LIMITS = {
  title: 200,
} as const;
