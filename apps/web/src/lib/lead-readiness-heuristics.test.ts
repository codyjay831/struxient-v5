import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLeadReadiness, isSmartAddress } from "./lead-readiness-heuristics";

test("isSmartAddress accepts partial street text but readiness does not", () => {
  assert.equal(isSmartAddress("401 Royal Tern Drive"), true);
});

test("evaluateLeadReadiness requires Google-verified address for Location", () => {
  const partial = evaluateLeadReadiness({
    contactName: "Test",
    companyName: null,
    email: "test@test.com",
    phone: "8314614886",
    address: "401 Royal Tern Drive",
    isAddressVerified: false,
  });

  assert.equal(partial.hasAddress, false);
  assert.equal(partial.isReady, false);

  const verified = evaluateLeadReadiness({
    contactName: "Test",
    companyName: null,
    email: "test@test.com",
    phone: "8314614886",
    address: "401 Royal Tern Dr, Some City, CA 93955, USA",
    isAddressVerified: true,
  });

  assert.equal(verified.hasAddress, true);
  assert.equal(verified.isReady, true);
});
