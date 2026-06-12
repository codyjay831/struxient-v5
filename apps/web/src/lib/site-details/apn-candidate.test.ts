import assert from "node:assert/strict";
import test from "node:test";
import {
  decideGroundedApnCandidate,
  normalizeGroundedApnCandidate,
} from "@/lib/site-details/apn-candidate";

const validEvidence = {
  value: "0137-081-100",
  sourceTitle: "401 Royal Tern Dr - Redfin",
  sourceUrl: "https://www.redfin.com/CA/Vacaville/401-Royal-Tern-Dr/home/2617854",
  addressMatched: true,
  apnShownOnSource: true,
  explanation: "Source explicitly shows APN for exact address.",
} as const;

test("accepts explicit APN candidate with grounded source, verification path, and corroborating links", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [
      validEvidence,
      {
        ...validEvidence,
        sourceTitle: "Solano County Property Detail",
        sourceUrl: "https://solano.countygateway.com/PropertyDetail.aspx?PropertyID=122709",
      },
    ],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      {
        title: "Solano County Property Detail",
        url: "https://solano.countygateway.com/PropertyDetail.aspx?PropertyID=122709",
      },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate?.value, "0137-081-100");
  assert.equal(candidate?.sourceTitle, "Solano County Property Detail");
});

test("rejects APN candidate when source URL is missing from grounded links", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [{ title: "Zillow", url: "https://www.zillow.com/example" }],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when grounded source title is empty", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [
      { title: " ", url: validEvidence.sourceUrl },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when address match is false", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [{ ...validEvidence, addressMatched: false }],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when APN is not explicitly shown on source", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [{ ...validEvidence, apnShownOnSource: false }],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("accepts APN candidate when assessor URL already exists in database", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [
      validEvidence,
      {
        ...validEvidence,
        sourceTitle: "Zillow 401 Royal Tern Dr",
        sourceUrl: "https://www.zillow.com/homedetails/401-Royal-Tern-Dr-Vacaville-CA-95687/",
      },
    ],
    sourceLinks: [
      { title: "Redfin", url: "https://www.redfin.com/CA/Vacaville/401-Royal-Tern-Dr/home/2617854" },
      {
        title: "Zillow",
        url: "https://www.zillow.com/homedetails/401-Royal-Tern-Dr-Vacaville-CA-95687/",
      },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: null,
    existingOfficialVerificationUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate?.value, "0137-081-100");
});

test("rejects APN candidate when no official verification path is available", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: null,
    existingOfficialVerificationUrl: null,
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when only one source link exists", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [{ title: "Redfin", url: "https://www.redfin.com/example" }],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when no secondary discovery source is present", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
      { title: "Parcel Viewer", url: "https://maps.solanocounty.gov/parcel" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("accepts APN from single trusted listing source when official verification exists", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate?.value, "0137-081-100");
  assert.equal(candidate?.sourceTitle, "Redfin");
});

test("accepts APN when official verification URL is grounded redirect", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [validEvidence],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl:
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEXAMPLE",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate?.value, "0137-081-100");
});

test("rejects generic map search APN sources", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [{
      ...validEvidence,
      sourceTitle: "Solano County Web Query / Map Search",
      sourceUrl: "https://solano.countygateway.com/?Search=401+ROYAL+TERN",
    }],
    sourceLinks: [
      { title: "Solano County Web Query / Map Search", url: "https://solano.countygateway.com/?Search=401+ROYAL+TERN" },
      { title: "Redfin", url: "https://www.redfin.com/CA/Vacaville/401-Royal-Tern-Dr/home/2617854" },
    ],
    countyAssessorSearchUrl: "https://solano.countygateway.com/",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN candidate when source points to neighboring address", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [{
      ...validEvidence,
      sourceTitle: "407 Royal Tern Drive property details",
      sourceUrl: "https://www.redfin.com/CA/Vacaville/407-Royal-Tern-Dr/home/2622140",
    }],
    sourceLinks: [
      {
        title: "407 Royal Tern Drive property details",
        url: "https://www.redfin.com/CA/Vacaville/407-Royal-Tern-Dr/home/2622140",
      },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("rejects APN evidence when source ZIP mismatches target ZIP", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [{
      ...validEvidence,
      sourceTitle: "401 Royal Tern Drive, Vacaville, CA 95688",
      sourceUrl: "https://www.redfin.com/CA/Vacaville/401-Royal-Tern-Dr/home/2617854",
    }],
    sourceLinks: [
      {
        title: "401 Royal Tern Drive, Vacaville, CA 95688",
        url: "https://www.redfin.com/CA/Vacaville/401-Royal-Tern-Dr/home/2617854",
      },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA 95687",
  });
  assert.equal(candidate, null);
});

test("rejects APN evidence when sources disagree on APN value", () => {
  const candidate = normalizeGroundedApnCandidate({
    apnEvidence: [
      validEvidence,
      {
        ...validEvidence,
        value: "0137-470-010",
        sourceTitle: "Compass 401 Royal Tern Dr",
        sourceUrl: "https://www.compass.com/homedetails/401-Royal-Tern-Dr-Vacaville-CA-95687/",
      },
    ],
    sourceLinks: [
      { title: "Redfin", url: validEvidence.sourceUrl },
      {
        title: "Compass",
        url: "https://www.compass.com/homedetails/401-Royal-Tern-Dr-Vacaville-CA-95687/",
      },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA, USA",
  });
  assert.equal(candidate, null);
});

test("returns neighbor-detected decision metadata for adjacent address evidence", () => {
  const decision = decideGroundedApnCandidate({
    apnEvidence: [{
      ...validEvidence,
      sourceTitle: "407 Royal Tern Drive property details",
      sourceUrl: "https://www.redfin.com/CA/Vacaville/407-Royal-Tern-Dr/home/2622140",
    }],
    sourceLinks: [
      {
        title: "407 Royal Tern Drive property details",
        url: "https://www.redfin.com/CA/Vacaville/407-Royal-Tern-Dr/home/2622140",
      },
      { title: "Solano County Assessor", url: "https://ca-solano.publicaccessnow.com/Assessor" },
    ],
    countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
    addressLine: "401 Royal Tern Drive, Vacaville, CA 95687",
  });
  assert.equal(decision.candidate, null);
  assert.equal(decision.neighborEvidenceDetected, true);
});
