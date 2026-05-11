import {
  buildManualPublicIntakeSnapshotFromFreeText,
  sanitizePublicIntakeServiceLocationFromClient,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";

const MAX_JSON = 16_000;

function trimOrEmpty(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

/**
 * Resolves a normalized service-location snapshot from staff or public forms:
 * prefers validated JSON from the hidden field, otherwise builds a manual snapshot
 * from the visible address line (same rules as public intake).
 */
export function resolveServiceLocationSnapshotFromFormData(formData: FormData): {
  snapshot: PublicIntakeServiceLocationV1 | null;
  serviceAddressText: string;
} {
  const serviceAddressText = trimOrEmpty(formData.get("serviceAddress"));
  const rawJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));
  if (rawJson.length > MAX_JSON) {
    return { snapshot: null, serviceAddressText };
  }
  if (rawJson.length > 0) {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      const sanitized = sanitizePublicIntakeServiceLocationFromClient(parsed);
      if (sanitized) {
        return { snapshot: sanitized, serviceAddressText };
      }
    } catch {
      /* fall through */
    }
  }
  const manual = buildManualPublicIntakeSnapshotFromFreeText(serviceAddressText);
  return { snapshot: manual, serviceAddressText };
}
