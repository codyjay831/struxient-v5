/** Shared caps for lead form fields (server + client maxLength). */
export const LEAD_FIELD_LIMITS = {
  title: 500,
  contactName: 500,
  sourceDetail: 1000,
  email: 320,
  phone: 80,
  notes: 20_000,
} as const;
