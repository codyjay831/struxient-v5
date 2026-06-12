import assert from "node:assert/strict";
import test from "node:test";
import {
  decideGroundedElectricUtilityCandidate,
  normalizeGroundedElectricUtilityCandidate,
} from "@/lib/site-details/utility-candidate";

const validCandidate = {
  name: "PG&E",
  officialWebsite: "https://www.pge.com",
  serviceUpgradeUrl: "https://www.pge.com/new-service",
  coverageSourceTitle: "PG&E electric service territory",
  coverageSourceUrl: "https://www.pge.com/service-territory",
  coverageBasis: "ZIP",
  addressMatched: true,
  isElectric: true,
  explanation: "PG&E electric territory includes this ZIP.",
} as const;

test("accepts grounded electric utility candidate", () => {
  const candidate = normalizeGroundedElectricUtilityCandidate({
    candidate: validCandidate,
    sourceLinks: [
      { title: "PG&E electric service territory", url: "https://www.pge.com/service-territory" },
      { title: "City utility FAQ", url: "https://www.cityofvacaville.gov/government/utilities/utilities-faq" },
    ],
  });
  assert.equal(candidate?.name, "PG&E");
});

test("rejects candidate when coverage source is not grounded", () => {
  const candidate = normalizeGroundedElectricUtilityCandidate({
    candidate: validCandidate,
    sourceLinks: [{ title: "Official", url: "https://www.pge.com/other-page" }],
  });
  assert.equal(candidate, null);
});

test("rejects candidate marked non-electric", () => {
  const candidate = normalizeGroundedElectricUtilityCandidate({
    candidate: { ...validCandidate, isElectric: false },
    sourceLinks: [{ title: "PG&E electric service territory", url: "https://www.pge.com/service-territory" }],
  });
  assert.equal(candidate, null);
});

test("rejects water or sewer utility candidates", () => {
  const candidate = normalizeGroundedElectricUtilityCandidate({
    candidate: {
      ...validCandidate,
      name: "City of Vacaville Utilities",
      officialWebsite: "https://www.cityofvacaville.gov/government/utilities",
    },
    sourceLinks: [
      { title: "City of Vacaville Utilities", url: "https://www.cityofvacaville.gov/government/utilities" },
      { title: "Utilities FAQ", url: "https://www.cityofvacaville.gov/government/utilities/utilities-faq" },
    ],
  });
  assert.equal(candidate, null);
});

test("returns decision reason when candidate source is not grounded", () => {
  const decision = decideGroundedElectricUtilityCandidate({
    candidate: validCandidate,
    sourceLinks: [{ title: "Other source", url: "https://www.pge.com/other-page" }],
  });
  assert.equal(decision.candidate, null);
  assert.equal(decision.reason, "SOURCE_NOT_GROUNDED");
});

test("rejects community-choice providers as distribution utility", () => {
  const decision = decideGroundedElectricUtilityCandidate({
    candidate: {
      ...validCandidate,
      name: "Silicon Valley Clean Energy (Community Choice)",
      officialWebsite: "https://svcleanenergy.org",
    },
    sourceLinks: [
      { title: "SVCE", url: "https://www.pge.com/service-territory" },
      { title: "PG&E", url: "https://www.pge.com/" },
    ],
  });
  assert.equal(decision.candidate, null);
  assert.equal(decision.reason, "NOT_DISTRIBUTION_UTILITY");
});
