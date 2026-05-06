/** Shared caps for quote draft form fields (server + client maxLength). */
export const QUOTE_FIELD_LIMITS = {
  title: 500,
  internalNotes: 20_000,
} as const;
