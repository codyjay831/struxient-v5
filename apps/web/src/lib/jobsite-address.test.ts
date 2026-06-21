import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION } from "./public-lead-service-location";
import { isLeadAddressQuoteReady, isLeadAddressVerified } from "./jobsite-address";

function addressJson(input: {
  addressLine1: string;
  formattedAddress: string;
  googlePlaceId: string;
}) {
  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    addressLine1: input.addressLine1,
    formattedAddress: input.formattedAddress,
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    googlePlaceId: input.googlePlaceId,
    latitude: null,
    longitude: null,
    source: "manual" as const,
  };
}

test("free-text address without google place id is not quote ready", () => {
  const row = {
    address: addressJson({
      addressLine1: "401 Royal Tern Drive",
      formattedAddress: "401 Royal Tern Drive",
      googlePlaceId: "",
    }),
    signals: null,
  };
  assert.equal(isLeadAddressVerified(row), false);
  assert.equal(isLeadAddressQuoteReady(row), false);
});

test("verified lead address satisfies quote readiness", () => {
  const row = {
    address: addressJson({
      addressLine1: "401 Royal Tern Dr",
      formattedAddress: "401 Royal Tern Dr, Monterey, CA 93955, USA",
      googlePlaceId: "ChIJ_test_place_id",
    }),
    signals: null,
  };
  assert.equal(isLeadAddressVerified(row), true);
  assert.equal(isLeadAddressQuoteReady(row), true);
});

test("linked customer primary location can satisfy quote readiness when lead has no intake jobsite", () => {
  const row = {
    address: null,
    signals: null,
  };
  assert.equal(
    isLeadAddressQuoteReady(row, { customerPrimaryLocation: { googlePlaceId: "ChIJ_customer_primary" } }),
    true,
  );
});

test("linked customer primary does not mask different unresolved lead jobsite", () => {
  const row = {
    address: addressJson({
      addressLine1: "99 New Property Ln",
      formattedAddress: "99 New Property Ln, Austin, TX",
      googlePlaceId: "",
    }),
    signals: null,
  };
  assert.equal(isLeadAddressVerified(row), false);
  assert.equal(
    isLeadAddressQuoteReady(row, { customerPrimaryLocation: { googlePlaceId: "ChIJ_customer_primary" } }),
    false,
  );
});

test("resolved service location satisfies quote readiness for linked lead", () => {
  const row = {
    address: addressJson({
      addressLine1: "99 New Property Ln",
      formattedAddress: "99 New Property Ln, Austin, TX",
      googlePlaceId: "",
    }),
    signals: null,
  };
  assert.equal(
    isLeadAddressQuoteReady(row, {
      resolvedServiceLocation: { googlePlaceId: "ChIJ_resolved_site" },
      customerPrimaryLocation: { googlePlaceId: "ChIJ_other_primary" },
    }),
    true,
  );
});
