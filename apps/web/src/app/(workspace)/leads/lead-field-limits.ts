/** Shared caps for opportunity form fields (server + client maxLength). */
export const LEAD_FIELD_LIMITS = {
  contactName: 120,
  sourceDetail: 255,
  email: 255,
  phone: 40,
  requestType: 80,
  scopeSummary: 4000,
  notes: 4000,
  /** Public Intake Form — sections are composed into `Lead.notes`. */
  publicIntakeServiceAddress: 2000,
  publicIntakePreferredTiming: 500,
  publicIntakeRequestDetails: 4000,
} as const;

export type LeadFieldLimits = typeof LEAD_FIELD_LIMITS;
