/** Shared caps for customer form fields (server + client maxLength). */
export const CUSTOMER_FIELD_LIMITS = {
  displayName: 500,
  companyName: 500,
  email: 320,
  phone: 80,
  notes: 20_000,
} as const;
