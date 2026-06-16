import assert from "node:assert/strict";
import test from "node:test";
import { geocoderResultToSnapshot } from "./address-snapshot-from-google";

const confidentResult = {
  formatted_address: "401 Royal Tern Dr, Marina, CA 93933, USA",
  place_id: "place-123",
  address_components: [
    { long_name: "401", short_name: "401", types: ["street_number"] },
    { long_name: "Royal Tern Drive", short_name: "Royal Tern Dr", types: ["route"] },
    { long_name: "Marina", short_name: "Marina", types: ["locality", "political"] },
    { long_name: "California", short_name: "CA", types: ["administrative_area_level_1", "political"] },
    { long_name: "93933", short_name: "93933", types: ["postal_code"] },
    { long_name: "United States", short_name: "US", types: ["country", "political"] },
  ],
  geometry: { location: { lat: 36.68, lng: -121.8 } },
  types: ["street_address"],
};

test("geocoderResultToSnapshot maps Google components into intake snapshot", () => {
  const snap = geocoderResultToSnapshot(confidentResult);
  assert.ok(snap);
  assert.equal(snap?.googlePlaceId, "place-123");
  assert.equal(snap?.city, "Marina");
  assert.equal(snap?.state, "California");
  assert.equal(snap?.postalCode, "93933");
  assert.equal(snap?.source, "google_places");
});

test("resolveAddressViaGeocode auto-resolves a single confident match", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [confidentResult],
      }),
    }) as Response;

  const { resolveAddressViaGeocode } = await import("./google-maps-geocode");
  const result = await resolveAddressViaGeocode({
    addressLine: "401 Royal Tern Drive",
    snapshot: null,
  });

  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.equal(result.snapshot.googlePlaceId, "place-123");
  }

  globalThis.fetch = originalFetch;
});

test("resolveAddressViaGeocode suggests when multiple street results returned", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          confidentResult,
          {
            ...confidentResult,
            place_id: "place-456",
            formatted_address: "401 Royal Tern Dr, Wilmington, NC 28409, USA",
          },
        ],
      }),
    }) as Response;

  const { resolveAddressViaGeocode } = await import("./google-maps-geocode");
  const result = await resolveAddressViaGeocode({
    addressLine: "401 Royal Tern Drive",
    snapshot: null,
  });

  assert.equal(result.status, "suggest");
  if (result.status === "suggest") {
    assert.equal(result.candidates.length, 2);
  }

  globalThis.fetch = originalFetch;
});

test("resolveAddressViaGeocode suggests on partial_match", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ ...confidentResult, partial_match: true }],
      }),
    }) as Response;

  const { resolveAddressViaGeocode } = await import("./google-maps-geocode");
  const result = await resolveAddressViaGeocode({
    addressLine: "401 Royal Tern Drive",
    snapshot: null,
  });

  assert.equal(result.status, "suggest");

  globalThis.fetch = originalFetch;
});

test("resolveAddressViaGeocode fails with no results", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ status: "ZERO_RESULTS", results: [] }),
    }) as Response;

  const { resolveAddressViaGeocode } = await import("./google-maps-geocode");
  const result = await resolveAddressViaGeocode({
    addressLine: "401 Royal Tern Drive",
    snapshot: null,
  });

  assert.equal(result.status, "failed");

  globalThis.fetch = originalFetch;
});
