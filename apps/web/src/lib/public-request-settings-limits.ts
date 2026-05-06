/** Server + UI caps for `PublicRequestSettings` (not form-builder sprawl). */
export const PUBLIC_REQUEST_SETTINGS_LIMITS = {
  formTitle: 200,
  introMessage: 6000,
  emergencyWarningText: 2000,
  submitButtonText: 80,
  requestTypeLabel: 120,
  requestTypeValue: 40,
  maxRequestTypeOptions: 12,
} as const;
