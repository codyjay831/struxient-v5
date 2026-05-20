import type { Prisma } from "@prisma/client";
import {
  DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS,
  type PublicRequestTypeOption,
} from "@/lib/public-request-settings-defaults";
import { parseStoredRequestTypeOptionsJson } from "@/lib/public-request-settings-validation";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Reads `requestTypeOptions` from a public `IntakeFormDefinition.triageRules`.
 * Returns null when missing or empty so callers can apply legacy fallback.
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
 * Runtime source of truth order:
 * 1) per-form `triageRules.requestTypeOptions`
 * 2) legacy org `PublicRequestSettings.requestTypeOptionsJson`
 * 3) code defaults
 */
export function resolvePublicFormRequestTypeOptions(
  triageRules: unknown,
  legacySettingsRequestTypeOptionsJson?: Prisma.JsonValue | null,
): PublicRequestTypeOption[] {
  const fromForm = readPublicRequestTypeOptionsFromTriageRules(triageRules);
  if (fromForm) {
    return fromForm;
  }
  if (legacySettingsRequestTypeOptionsJson !== undefined) {
    console.warn("[intake] requestTypeOptions fallback", {
      source: "legacyPublicRequestSettings",
      reason: "missingPerFormTriageRulesRequestTypeOptions",
    });
    return parseStoredRequestTypeOptionsJson(legacySettingsRequestTypeOptionsJson);
  }
  console.warn("[intake] requestTypeOptions fallback", {
    source: "codeDefaults",
    reason: "missingPerFormAndLegacySettingsRequestTypeOptions",
  });
  return DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS;
}
