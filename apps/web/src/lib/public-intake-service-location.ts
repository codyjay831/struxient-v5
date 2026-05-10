/**
 * Normalized public-intake service location (v1).
 * Coordinates and place id are informational only — never trust for auth, billing, or access control.
 */
export const PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION = 1 as const;

export type PublicIntakeServiceLocationV1 = {
  schemaVersion: typeof PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION;
  formattedAddress: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
  source: "google_places" | "manual";
};

const MAX = {
  formattedAddress: 2000,
  addressLine: 500,
  city: 200,
  state: 120,
  postalCode: 32,
  country: 120,
  googlePlaceId: 512,
} as const;

function trimToMax(value: unknown, max: number): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Accepts client JSON and returns a DB-safe object, or null if unusable.
 * Never throws. Invalid payloads are dropped (intake still succeeds on notes + serviceAddress).
 */
export function sanitizePublicIntakeServiceLocationFromClient(
  input: unknown,
): PublicIntakeServiceLocationV1 | null {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const o = input as Record<string, unknown>;
  if (o.schemaVersion !== PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION) {
    return null;
  }

  const formattedAddress = trimToMax(o.formattedAddress, MAX.formattedAddress);
  const addressLine1 = trimToMax(o.addressLine1, MAX.addressLine);
  const addressLine2 = trimToMax(o.addressLine2, MAX.addressLine);
  const city = trimToMax(o.city, MAX.city);
  const state = trimToMax(o.state, MAX.state);
  const postalCode = trimToMax(o.postalCode, MAX.postalCode);
  const country = trimToMax(o.country, MAX.country);
  const googlePlaceId = trimToMax(o.googlePlaceId, MAX.googlePlaceId);

  const source = o.source === "google_places" || o.source === "manual" ? o.source : null;
  if (source == null) {
    return null;
  }

  if (!formattedAddress && !addressLine1) {
    return null;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (isFiniteNumber(o.latitude) && isFiniteNumber(o.longitude)) {
    if (o.latitude >= -90 && o.latitude <= 90 && o.longitude >= -180 && o.longitude <= 180) {
      latitude = o.latitude;
      longitude = o.longitude;
    }
  }

  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    formattedAddress,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    googlePlaceId,
    latitude,
    longitude,
    source,
  };
}

/** Reads a value stored on `Lead.publicIntakeServiceLocation`. */
export function parseStoredPublicIntakeServiceLocation(
  value: unknown,
): PublicIntakeServiceLocationV1 | null {
  return sanitizePublicIntakeServiceLocationFromClient(value);
}

export function publicIntakeFormattedAddressForDisplay(
  value: unknown,
): string | null {
  const row = parseStoredPublicIntakeServiceLocation(value);
  if (!row) return null;
  const primary = row.formattedAddress.trim() || row.addressLine1.trim();
  if (!primary) return null;
  return primary;
}

/** Server-built snapshot when the submitter typed a free-form service address (no Places JSON). */
export function buildManualPublicIntakeSnapshotFromFreeText(
  text: string,
): PublicIntakeServiceLocationV1 | null {
  const t = text.trim();
  if (!t) {
    return null;
  }
  const max = MAX.formattedAddress;
  const clipped = t.length > max ? t.slice(0, max) : t;
  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    formattedAddress: clipped,
    addressLine1: clipped,
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    googlePlaceId: "",
    latitude: null,
    longitude: null,
    source: "manual",
  };
}
