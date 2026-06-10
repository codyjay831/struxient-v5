import assert from "node:assert/strict";
import test from "node:test";
import { CustomerServiceLocationSource } from "@prisma/client";
import {
  resolveLocationCandidate,
  type CandidateLocation,
} from "@/lib/site-details/service-location-backfill";

function makeLocation(input: Partial<CandidateLocation> & Pick<CandidateLocation, "id">): CandidateLocation {
  return {
    id: input.id,
    customerId: input.customerId ?? null,
    createdFromLeadId: input.createdFromLeadId ?? null,
    googlePlaceId: input.googlePlaceId ?? "",
    addressFingerprint: input.addressFingerprint ?? "",
    formattedAddress: input.formattedAddress ?? "123 Main St",
    isPrimary: input.isPrimary ?? false,
    createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
  };
}

test("resolveLocationCandidate picks createdFromLead exact match", () => {
  const rows = [
    makeLocation({ id: "a", customerId: "c1", createdFromLeadId: "lead-1", addressFingerprint: "x" }),
    makeLocation({ id: "b", customerId: "c1", addressFingerprint: "x", isPrimary: true }),
  ];
  const result = resolveLocationCandidate(rows, {
    customerId: "c1",
    leadId: "lead-1",
    snapshot: {
      primaryLine: "123 Main St",
      placeId: "",
      fingerprint: "x",
      source: CustomerServiceLocationSource.manual,
      addressLine1: "123 Main St",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      latitude: null,
      longitude: null,
    },
  });
  assert.deepEqual(result, { kind: "matched", locationId: "a" });
});

test("resolveLocationCandidate returns ambiguous when top score ties", () => {
  const rows = [
    makeLocation({ id: "a", customerId: "c1", addressFingerprint: "same" }),
    makeLocation({ id: "b", customerId: "c1", addressFingerprint: "same" }),
  ];
  const result = resolveLocationCandidate(rows, {
    customerId: "c1",
    leadId: "lead-1",
    snapshot: {
      primaryLine: "123 Main St",
      placeId: "",
      fingerprint: "same",
      source: CustomerServiceLocationSource.manual,
      addressLine1: "123 Main St",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "",
      latitude: null,
      longitude: null,
    },
  });
  assert.deepEqual(result, { kind: "ambiguous" });
});
