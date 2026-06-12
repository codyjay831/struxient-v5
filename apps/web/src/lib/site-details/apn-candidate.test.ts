import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGroundedApnCandidate } from "@/lib/site-details/apn-candidate";

const validCandidate = {
  value: "0137-081-100",
  sourceTitle: "Redfin listing",
  sourceUrl: "https://www.redfin.com/example",
  addressMatched: true,
  apnShownOnSource: true,
  explanation: "Source explicitly shows APN for exact address.",
} as const;

test("accepts explicit APN candidate with grounded source, verification path, and corroborating links", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [
      { title: "Redfin", url: "https://www.redfin.com/example" },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate?.value, "0137-081-100");
  assert.equal(candidate?.sourceTitle, "Redfin");
});

test("rejects APN candidate when source URL is missing from grounded links", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [{ title: "Zillow", url: "https://www.zillow.com/example" }],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when grounded source title is empty", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [
      { title: " ", url: "https://www.redfin.com/example" },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when address match is false", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: { ...validCandidate, addressMatched: false },
    sourceLinks: [
      { title: "Redfin", url: "https://www.redfin.com/example" },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when APN is not explicitly shown on source", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: { ...validCandidate, apnShownOnSource: false },
    sourceLinks: [
      { title: "Redfin", url: "https://www.redfin.com/example" },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate, null);
});

test("accepts APN candidate when assessor URL already exists in database", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [
      { title: "Redfin", url: "https://www.redfin.com/example" },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: null,
    existingOfficialVerificationUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate?.value, "0137-081-100");
});

test("rejects APN candidate when no official verification path is available", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [
      { title: "Redfin", url: "https://www.redfin.com/example" },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: null,
    existingOfficialVerificationUrl: null,
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when only one source link exists", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [{ title: "Redfin", url: "https://www.redfin.com/example" }],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when no secondary discovery source is present", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnCandidate: validCandidate,
    sourceLinks: [
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
      { title: "Parcel Viewer", url: "https://maps.solanocounty.gov/parcel" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
  });
  assert.equal(candidate, null);
});
