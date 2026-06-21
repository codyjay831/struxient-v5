import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION } from "./public-lead-service-location";
import {
  classifyLeadIntakeAgainstCustomerSites,
  describeLeadCustomerLinkSiteOutcome,
  intakeDisplayLineFromSnapshot,
} from "./lead-customer-link-site";

function snapshot(input: {
  formattedAddress: string;
  addressLine1?: string;
  googlePlaceId?: string;
}) {
  return {
    schemaVersion: PUBLIC_INTAKE_SERVICE_LOCATION_SCHEMA_VERSION,
    formattedAddress: input.formattedAddress,
    addressLine1: input.addressLine1 ?? input.formattedAddress,
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    googlePlaceId: input.googlePlaceId ?? "",
    latitude: null,
    longitude: null,
    source: "manual" as const,
  };
}

test("classifyLeadIntakeAgainstCustomerSites returns no-address when intake empty", () => {
  const outcome = classifyLeadIntakeAgainstCustomerSites(null, []);
  assert.equal(outcome.kind, "no-address");
});

test("classifyLeadIntakeAgainstCustomerSites matches existing site by place id", () => {
  const intake = snapshot({
    formattedAddress: "401 Royal Tern Dr, Vacaville, CA",
    googlePlaceId: "ChIJ_test",
  });
  const outcome = classifyLeadIntakeAgainstCustomerSites(intake, [
    {
      id: "loc_1",
      formattedAddress: "401 Royal Tern Dr, Vacaville, CA 95687, USA",
      addressLine1: "401 Royal Tern Dr",
      googlePlaceId: "ChIJ_test",
      isPrimary: false,
    },
  ]);
  assert.equal(outcome.kind, "existing-site");
  if (outcome.kind === "existing-site") {
    assert.equal(outcome.serviceLocationId, "loc_1");
  }
});

test("classifyLeadIntakeAgainstCustomerSites matches existing site by normalized address", () => {
  const intake = snapshot({
    formattedAddress: "401 Royal Tern Dr, Vacaville, CA 95687, USA",
  });
  const outcome = classifyLeadIntakeAgainstCustomerSites(intake, [
    {
      id: "loc_2",
      formattedAddress: "401 Royal Tern Dr, Vacaville, CA 95687, USA",
      addressLine1: "401 Royal Tern Dr",
      googlePlaceId: "",
      isPrimary: true,
    },
  ]);
  assert.equal(outcome.kind, "existing-site");
});

test("classifyLeadIntakeAgainstCustomerSites returns add-new-site when no match", () => {
  const intake = snapshot({
    formattedAddress: "99 New Property Ln, Austin, TX",
  });
  const outcome = classifyLeadIntakeAgainstCustomerSites(intake, [
    {
      id: "loc_3",
      formattedAddress: "401 Royal Tern Dr, Vacaville, CA",
      addressLine1: "401 Royal Tern Dr",
      googlePlaceId: "",
      isPrimary: true,
    },
  ]);
  assert.equal(outcome.kind, "add-new-site");
  if (outcome.kind === "add-new-site") {
    assert.equal(outcome.intakeDisplayLine, "99 New Property Ln, Austin, TX");
  }
});

test("describeLeadCustomerLinkSiteOutcome summarizes add-new-site", () => {
  const text = describeLeadCustomerLinkSiteOutcome({
    kind: "add-new-site",
    intakeDisplayLine: "99 New Property Ln",
  });
  assert.ok(text.includes("Add new service address"));
  assert.ok(text.includes("99 New Property Ln"));
});

test("intakeDisplayLineFromSnapshot prefers formatted address", () => {
  const line = intakeDisplayLineFromSnapshot(
    snapshot({ formattedAddress: "123 Main St", addressLine1: "123 Main" }),
  );
  assert.equal(line, "123 Main St");
});
