/** Shared caps for lead form fields (server + client maxLength). */
export const LEAD_FIELD_LIMITS = {
  title: 500,
  contactName: 500,
  sourceDetail: 1000,
  email: 320,
  phone: 80,
  requestType: 500,
  scopeSummary: 10_000,
  notes: 20_000,
  /** Public Intake Form — sections are composed into `Lead.notes`. */
  publicIntakeServiceAddress: 2000,
  publicIntakePreferredTiming: 500,
  publicIntakeRequestDetails: 12_000,
} as const;
