import type { Prisma } from "@prisma/client";
import { DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS } from "@/lib/public-request-settings-defaults";
import { PUBLIC_REQUEST_SETTINGS_LIMITS } from "@/lib/public-request-settings-limits";
import type { PublicRequestTypeOption } from "@/lib/public-request-settings-defaults";

const VALUE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ValidatedRequestTypeOptions =
  | { ok: true; options: PublicRequestTypeOption[] }
  | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates `requestTypeOptionsJson` from the database or from a settings form payload.
 * Returns defaults when JSON is empty or unusable (safe read path).
 */
export function parseStoredRequestTypeOptionsJson(
  raw: Prisma.JsonValue | null | undefined,
): PublicRequestTypeOption[] {
  const parsed = validateRequestTypeOptionsJson(raw);
  if (parsed.ok) {
    return parsed.options.length > 0 ? parsed.options : DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS;
  }
  return DEFAULT_PUBLIC_REQUEST_TYPE_OPTIONS;
}

export function validateRequestTypeOptionsJson(raw: unknown): ValidatedRequestTypeOptions {
  if (raw == null) {
    return { ok: true, options: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "Request type options must be a JSON array." };
  }
  if (raw.length === 0) {
    return { ok: true, options: [] };
  }
  if (raw.length > PUBLIC_REQUEST_SETTINGS_LIMITS.maxRequestTypeOptions) {
    return {
      ok: false,
      error: `At most ${PUBLIC_REQUEST_SETTINGS_LIMITS.maxRequestTypeOptions} request types are allowed.`,
    };
  }

  const seen = new Set<string>();
  const options: PublicRequestTypeOption[] = [];

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!isRecord(row)) {
      return { ok: false, error: "Each request type must be an object with value and label." };
    }
    const valueRaw = row.value;
    const labelRaw = row.label;
    if (typeof valueRaw !== "string" || typeof labelRaw !== "string") {
      return { ok: false, error: "Each request type needs text value and label fields." };
    }
    const value = valueRaw.trim().toLowerCase();
    const label = labelRaw.trim();
    if (!value || !label) {
      return { ok: false, error: "Request type value and label cannot be empty." };
    }
    if (value.length > PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeValue) {
      return { ok: false, error: "A request type value is too long." };
    }
    if (label.length > PUBLIC_REQUEST_SETTINGS_LIMITS.requestTypeLabel) {
      return { ok: false, error: "A request type label is too long." };
    }
    if (!VALUE_RE.test(value)) {
      return {
        ok: false,
        error:
          "Request type values must use lowercase letters, numbers, and single hyphens only (e.g. emergency-repair).",
      };
    }
    if (seen.has(value)) {
      return { ok: false, error: "Request type values must be unique." };
    }
    seen.add(value);
    options.push({ value, label });
  }

  return { ok: true, options };
}

export function requestTypeLabelByValue(
  options: PublicRequestTypeOption[],
  value: string,
): string | null {
  const v = value.trim().toLowerCase();
  const hit = options.find((o) => o.value === v);
  return hit ? hit.label : null;
}
