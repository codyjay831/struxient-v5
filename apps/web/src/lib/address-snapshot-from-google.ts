import {
  PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-lead-service-location";

export type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

export type GoogleGeocoderResult = {
  formatted_address?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: { location?: { lat?: number; lng?: number } };
  place_id?: string;
  partial_match?: boolean;
  types?: string[];
};

function componentLongName(
  components: GoogleAddressComponent[],
  ...types: string[]
): string {
  for (const t of types) {
    const c = components.find((x) => x.types.includes(t));
    if (c?.long_name) {
      return c.long_name;
    }
  }
  return "";
}

/**
 * Maps Google Geocoder / Places address_components into the canonical intake snapshot.
 */
export function geocoderResultToSnapshot(
  result: GoogleGeocoderResult,
): PublicIntakeServiceLocationV1 | null {
  const formattedAddress = (result.formatted_address ?? "").trim();
  const comps = result.address_components ?? [];
  const streetNumber = componentLongName(comps, "street_number");
  const route = componentLongName(comps, "route");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const subpremise = componentLongName(comps, "subpremise", "floor", "room");
  const premise = componentLongName(comps, "premise");
  const addressLine2 = [premise, subpremise].filter(Boolean).join(" · ").trim();
  const city = componentLongName(comps, "locality", "postal_town", "sublocality", "neighborhood");
  const state = componentLongName(comps, "administrative_area_level_1");
  const postalCode = componentLongName(comps, "postal_code");
  const country = componentLongName(comps, "country");
  const googlePlaceId = (result.place_id ?? "").trim();
  let latitude: number | null = null;
  let longitude: number | null = null;
  const loc = result.geometry?.location;
  if (loc) {
    const latN = loc.lat;
    const lngN = loc.lng;
    if (typeof latN === "number" && typeof lngN === "number" && Number.isFinite(latN) && Number.isFinite(lngN)) {
      latitude = latN;
      longitude = lngN;
    }
  }

  if (!formattedAddress && !addressLine1) {
    return null;
  }

  if (!googlePlaceId) {
    return null;
  }

  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    formattedAddress,
    addressLine1: addressLine1 || formattedAddress,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    googlePlaceId,
    latitude,
    longitude,
    source: "google_places",
  };
}

export type AddressResolveCandidate = {
  placeId: string;
  formattedAddress: string;
  snapshot: PublicIntakeServiceLocationV1;
};
