import assert from "node:assert/strict";
import test from "node:test";
import { buildLeadIntakeProjection } from "./lead-intake-projection";

const baseLead = {
  id: "lead-1",
  status: "NEW" as const,
  channel: "WEB_FORM" as const,
  customerId: null,
  convertedAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
  contact: {
    name: "Pat Lee",
    email: "pat@example.com",
    phone: "55501001234",
    companyName: null,
  },
  request: {
    type: "roof-repair",
    scope: "Leak in kitchen ceiling",
    neededByBucket: "ASAP",
    neededByDate: null,
  },
  address: {
    formattedAddress: "123 Main St, Austin, TX",
    googlePlaceId: "place-1",
  },
  signals: { urgencyHint: "HIGH", notes: "secret legacy blob" },
};

test("buildLeadIntakeProjection uses structured fields and omits legacy notes", () => {
  const p = buildLeadIntakeProjection({
    organizationId: "org-1",
    lead: baseLead,
    jobsiteAddressLine: "123 Main St, Austin, TX",
    isAddressVerified: true,
    attachmentCount: 2,
    events: [
      {
        type: "CREATED",
        payload: { input: { contact: { email: "secret@test.com" } } },
        createdAt: new Date("2026-01-01T12:00:00Z"),
      },
    ],
  });

  assert.equal(p.leadId, "lead-1");
  assert.equal(p.request.type, "roof-repair");
  assert.equal(p.request.scope, "Leak in kitchen ceiling");
  assert.equal(p.attachmentCount, 2);
  assert.equal(p.readiness.isReadyForPromotion, true);
  assert.equal(p.meta.legacyNotesExcluded, true);
  assert.equal(p.meta.derivedOnly, true);
  assert.equal(p.recentActivity.length, 1);
  assert.equal(p.recentActivity[0].label, "Request received");
  assert.equal(p.recentActivity[0].detail?.includes("secret"), false);
});

test("buildLeadIntakeProjection lists missing requirements when not ready", () => {
  const p = buildLeadIntakeProjection({
    organizationId: "org-1",
    lead: {
      ...baseLead,
      contact: { name: null, email: null, phone: null, companyName: null },
      address: null,
    },
    jobsiteAddressLine: null,
    isAddressVerified: false,
  });

  assert.equal(p.readiness.isReadyForPromotion, false);
  assert.ok(p.readiness.missingRequirementLabels.includes("Identity"));
  assert.equal(p.commercial.state, "ADD_CONTACT_INFO");
});

test("buildLeadIntakeProjection treats partial unverified address as not ready", () => {
  const p = buildLeadIntakeProjection({
    organizationId: "org-1",
    lead: {
      ...baseLead,
      address: {
        formattedAddress: "401 Royal Tern Drive",
        addressLine1: "401 Royal Tern Drive",
        googlePlaceId: "",
        source: "manual",
      },
    },
    jobsiteAddressLine: "401 Royal Tern Drive",
    isAddressVerified: false,
  });

  assert.equal(p.readiness.isReadyForPromotion, false);
  assert.ok(p.readiness.missingRequirementLabels.includes("Location"));
});
