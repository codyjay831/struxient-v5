import type { PublicRequestTypeOption } from "@/lib/public-request-settings-defaults";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Reads `requestTypeOptions` from `IntakeFormDefinition.triageRules`.
 * Returns null when missing or empty — no code-default fallback at runtime.
 */
export function readPublicRequestTypeOptionsFromTriageRules(
  triageRules: unknown,
): PublicRequestTypeOption[] | null {
  if (!isRecord(triageRules)) {
    return null;
  }
  const raw = triageRules.requestTypeOptions;
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const options: PublicRequestTypeOption[] = [];
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
  return options.length > 0 ? options : null;
}

/**
 * Runtime resolver for public intake request/service type options.
 * Source of truth: `IntakeFormDefinition.triageRules.requestTypeOptions` only.
 * Returns null when triageRules are missing or empty — callers must fail safely.
 * Code defaults belong in form provisioning (`ensureDefaultPublicIntakeFormDefinition`, create actions).
 */
export function resolvePublicFormRequestTypeOptions(
  triageRules: unknown,
): PublicRequestTypeOption[] | null {
  return readPublicRequestTypeOptionsFromTriageRules(triageRules);
}
