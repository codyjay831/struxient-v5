import {
  geocoderResultToSnapshot,
  type AddressResolveCandidate,
  type GoogleGeocoderResult,
} from "@/lib/address-snapshot-from-google";
import type { PublicIntakeServiceLocationV1 } from "@/lib/public-lead-service-location";

const STREET_LEVEL_TYPES = new Set([
  "street_address",
  "premise",
  "subpremise",
  "route",
  "establishment",
]);

export type GeocodeResolveResult =
  | { status: "resolved"; snapshot: PublicIntakeServiceLocationV1 }
  | { status: "suggest"; candidates: AddressResolveCandidate[] }
  | { status: "failed"; reason?: string };

type GeocodeApiResponse = {
  status: string;
  results?: GoogleGeocoderResult[];
  error_message?: string;
};

function getGoogleMapsServerApiKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function isStreetLevelResult(result: GoogleGeocoderResult): boolean {
  const types = result.types ?? [];
  return types.some((t) => STREET_LEVEL_TYPES.has(t));
}

function toCandidate(result: GoogleGeocoderResult): AddressResolveCandidate | null {
  const snapshot = geocoderResultToSnapshot(result);
  if (!snapshot) return null;
  return {
    placeId: snapshot.googlePlaceId,
    formattedAddress: snapshot.formattedAddress.trim() || snapshot.addressLine1,
    snapshot,
  };
}

function dedupeCandidates(candidates: AddressResolveCandidate[]): AddressResolveCandidate[] {
  const seen = new Set<string>();
  const out: AddressResolveCandidate[] = [];
  for (const c of candidates) {
    if (seen.has(c.placeId)) continue;
    seen.add(c.placeId);
    out.push(c);
  }
  return out;
}

function classifyGeocodeResults(results: GoogleGeocoderResult[]): GeocodeResolveResult {
  const streetResults = results.filter(isStreetLevelResult);
  const pool = streetResults.length > 0 ? streetResults : results;
  const candidates = dedupeCandidates(
    pool.map(toCandidate).filter((c): c is AddressResolveCandidate => c != null),
  );

  if (candidates.length === 0) {
    return { status: "failed", reason: "no_usable_results" };
  }

  if (candidates.length === 1) {
    const only = pool[0];
    if (only?.partial_match) {
      return { status: "suggest", candidates };
    }
    return { status: "resolved", snapshot: candidates[0].snapshot };
  }

  return { status: "suggest", candidates: candidates.slice(0, 5) };
}

async function fetchGeocode(url: URL): Promise<GeocodeApiResponse> {
  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    return { status: "UNKNOWN_ERROR" };
  }
  return (await res.json()) as GeocodeApiResponse;
}

function buildAddressQuery(
  addressLine: string,
  snapshot: PublicIntakeServiceLocationV1 | null,
): string {
  const parts = [addressLine.trim()];
  if (snapshot) {
    if (snapshot.city.trim()) parts.push(snapshot.city.trim());
    if (snapshot.state.trim()) parts.push(snapshot.state.trim());
    if (snapshot.postalCode.trim()) parts.push(snapshot.postalCode.trim());
  }
  return parts.filter(Boolean).join(", ");
}

/**
 * Attempts to resolve a partial intake address to a single Google-verified snapshot.
 */
export async function resolveAddressViaGeocode(params: {
  addressLine: string;
  snapshot?: PublicIntakeServiceLocationV1 | null;
}): Promise<GeocodeResolveResult> {
  const apiKey = getGoogleMapsServerApiKey();
  if (!apiKey) {
    return { status: "failed", reason: "missing_api_key" };
  }

  const query = buildAddressQuery(params.addressLine, params.snapshot ?? null);
  if (!query) {
    return { status: "failed", reason: "empty_query" };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", apiKey);

  const data = await fetchGeocode(url);
  if (data.status !== "OK" || !data.results?.length) {
    return { status: "failed", reason: data.status };
  }

  return classifyGeocodeResults(data.results);
}

/**
 * Fetches a structured snapshot for a known Google place ID.
 */
export async function fetchSnapshotByPlaceId(
  placeId: string,
): Promise<PublicIntakeServiceLocationV1 | null> {
  const apiKey = getGoogleMapsServerApiKey();
  const id = placeId.trim();
  if (!apiKey || !id) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("place_id", id);
  url.searchParams.set("key", apiKey);

  const data = await fetchGeocode(url);
  if (data.status !== "OK" || !data.results?.length) {
    return null;
  }

  return geocoderResultToSnapshot(data.results[0]);
}
