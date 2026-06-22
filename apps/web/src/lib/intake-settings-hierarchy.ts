/**
 * Canon-aligned intake settings levels (see docs/canon/lead-intake-canon.md §Settings hierarchy).
 * Product policy constants — not persisted until path enablement ships.
 */

export type IntakePathMode = "defaultService" | "tradeTemplate" | "complexProjectTriage";

export type IntakePathPreset = {
  mode: IntakePathMode;
  label: string;
  description: string;
  /** Shown in settings UI; enablement is future work. */
  available: boolean;
};

/** MVP: only default service path is live; others are visible but not toggleable yet. */
export const INTAKE_PATH_PRESETS: readonly IntakePathPreset[] = [
  {
    mode: "defaultService",
    label: "Standard service request",
    description:
      "Lightweight default intake — works without setup. This is what your public request link uses today.",
    available: true,
  },
  {
    mode: "tradeTemplate",
    label: "Trade template follow-ups",
    description:
      "Structured checklists for repeated trade scopes (roofing, HVAC, etc.). Coming after intake stabilization.",
    available: false,
  },
  {
    mode: "complexProjectTriage",
    label: "Complex project triage",
    description:
      "Big-picture questions only — no giant questionnaire. Coming after intake stabilization.",
    available: false,
  },
] as const;

export const INTAKE_SETTINGS_HUB_PATH = "/settings/intake";
export const INTAKE_PUBLIC_COPY_PATH = "/settings/intake/public";
export const INTAKE_CUSTOMER_FIELDS_PATH = "/settings/intake/customer-fields";
export const INTAKE_STAFF_PATH = "/settings/intake/staff";
export const INTAKE_SPECIALIZED_PATH = "/settings/intake/specialized";
export const INTAKE_SPECIALIZED_NEW_PATH = "/settings/intake/specialized/new";

export function intakeFormEditorPath(formId: string): string {
  return `/settings/intake/forms/${formId}`;
}

/** @deprecated Use INTAKE_SPECIALIZED_PATH — kept for redirect compatibility. */
export const INTAKE_CUSTOM_FORMS_PATH = INTAKE_SPECIALIZED_PATH;

/** @deprecated Use INTAKE_STAFF_PATH — kept for redirect compatibility. */
export const INTAKE_OFFICE_FORM_PATH = INTAKE_STAFF_PATH;
