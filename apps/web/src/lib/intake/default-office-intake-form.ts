import { LeadChannel } from "@prisma/client";
import {
  type IntakeFormDefinitionShape,
  type IntakeFormSchema,
} from "@/lib/intake/default-intake-form";
import type { IntakeRequestTypeOptionLike } from "@/lib/intake/map-intake-form-data-to-lead-input";

/** Default office request type labels (not tied to PublicRequestSettings). */
export const DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS: IntakeRequestTypeOptionLike[] = [
  { value: "repair", label: "Repair" },
  { value: "estimate", label: "Estimate / quote" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inspection", label: "Inspection" },
  { value: "other", label: "Other" },
];

export const DEFAULT_OFFICE_INTAKE_FORM_SLUG = "office-default";

export const DEFAULT_OFFICE_INTAKE_FORM_SCHEMA: IntakeFormSchema = {
  sections: [
    {
      key: "contact",
      title: "Contact",
      description: "Who is this intake for?",
      fields: [
        { key: "contact.name" },
        { key: "contact.email" },
        { key: "contact.phone" },
      ],
    },
    {
      key: "project",
      title: "Request",
      fields: [
        { key: "address.service" },
        { key: "request.type" },
        { key: "scope.text" },
        { key: "scope.photos" },
      ],
    },
    {
      key: "timing",
      title: "Timing",
      fields: [
        { key: "timing.bucket" },
        {
          key: "timing.specificDate",
          visibleIf: { fieldKey: "timing.bucket", equals: "SPECIFIC_DATE" },
        },
      ],
    },
  ],
};

/** Synthetic id for in-memory office fallback only. */
export const SYNTHETIC_DEFAULT_OFFICE_INTAKE_FORM_ID = "__office_default__";

export function isSyntheticDefaultOfficeIntakeFormDefinitionId(id: string): boolean {
  return id === SYNTHETIC_DEFAULT_OFFICE_INTAKE_FORM_ID;
}

export const DEFAULT_OFFICE_INTAKE_FORM_DEFINITION: IntakeFormDefinitionShape = {
  id: SYNTHETIC_DEFAULT_OFFICE_INTAKE_FORM_ID,
  name: "Office intake",
  slug: DEFAULT_OFFICE_INTAKE_FORM_SLUG,
  channel: LeadChannel.MANUAL,
  isPublic: false,
  isDefault: true,
  schema: DEFAULT_OFFICE_INTAKE_FORM_SCHEMA,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Reads optional `requestTypeOptions` from `IntakeFormDefinition.triageRules`.
 * Safe fallback to code defaults when missing or invalid.
 */
export function parseOfficeRequestTypeOptionsFromTriageRules(
  triageRules: unknown,
): IntakeRequestTypeOptionLike[] {
  if (!isRecord(triageRules)) {
    return DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS;
  }
  const raw = triageRules.requestTypeOptions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS;
  }
  const options: IntakeRequestTypeOptionLike[] = [];
  for (const row of raw) {
    if (!isRecord(row)) {
      continue;
    }
    const value =
      typeof row.value === "string" ? row.value.trim().toLowerCase() : "";
    const label = typeof row.label === "string" ? row.label.trim() : "";
    if (!value || !label) {
      continue;
    }
    options.push({ value, label });
  }
  return options.length > 0 ? options : DEFAULT_OFFICE_REQUEST_TYPE_OPTIONS;
}
