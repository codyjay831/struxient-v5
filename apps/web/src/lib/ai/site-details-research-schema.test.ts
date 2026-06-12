import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

const LocalSchema = z.object({
  electricUtilityCandidate: z
    .object({
      name: z.string().trim().min(1),
      officialWebsite: z.string().url().nullable(),
      serviceUpgradeUrl: z.string().url().nullable(),
      coverageSourceTitle: z.string().trim().min(1),
      coverageSourceUrl: z.string().url(),
      coverageBasis: z.enum(["ZIP", "CITY", "COUNTY", "ADDRESS"]),
      addressMatched: z.boolean(),
      isElectric: z.boolean(),
      explanation: z.string().trim().min(1).max(500),
    })
    .nullable(),
  jurisdictionName: z.string().trim().min(1).nullable(),
  jurisdictionType: z
    .enum(["CITY", "COUNTY", "UNINCORPORATED_COUNTY", "DISTRICT"])
    .nullable(),
  jurisdictionOfficialWebsite: z.string().url().nullable(),
  countyAssessorCounty: z.string().trim().min(1).nullable(),
  countyAssessorState: z.string().trim().min(1).nullable(),
  countyAssessorSearchUrl: z.string().url().nullable(),
  apnEvidence: z
    .array(
      z.object({
        value: z.string().trim().min(1),
        sourceTitle: z.string().trim().min(1),
        sourceUrl: z.string().url(),
        addressMatched: z.boolean(),
        apnShownOnSource: z.boolean(),
        explanation: z.string().trim().min(1).max(500),
      }),
    )
    .default([]),
  apnCandidate: z
    .object({
      value: z.string().trim().min(1),
      sourceTitle: z.string().trim().min(1),
      sourceUrl: z.string().url(),
      addressMatched: z.boolean(),
      apnShownOnSource: z.boolean(),
      explanation: z.string().trim().min(1).max(500),
    })
    .nullable()
    .optional()
    .default(null),
  sourceLinks: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
});

test("site details research schema accepts nullable known fields", () => {
  const parsed = LocalSchema.parse({
    electricUtilityCandidate: null,
    jurisdictionName: null,
    jurisdictionType: null,
    jurisdictionOfficialWebsite: null,
    countyAssessorCounty: null,
    countyAssessorState: null,
    countyAssessorSearchUrl: null,
    apnEvidence: [
      {
        value: "0137-081-100",
        sourceTitle: "Redfin",
        sourceUrl: "https://www.redfin.com/example",
        addressMatched: true,
        apnShownOnSource: true,
        explanation: "Listing page explicitly shows APN for the exact address.",
      },
    ],
    apnCandidate: {
      value: "0137-081-100",
      sourceTitle: "Redfin",
      sourceUrl: "https://www.redfin.com/example",
      addressMatched: true,
      apnShownOnSource: true,
      explanation: "Listing page explicitly shows APN for the exact address.",
    },
    sourceLinks: [],
  });
  assert.equal(parsed.electricUtilityCandidate, null);
});

test("site details research schema defaults missing apnCandidate to null", () => {
  const parsed = LocalSchema.parse({
    electricUtilityCandidate: null,
    jurisdictionName: null,
    jurisdictionType: null,
    jurisdictionOfficialWebsite: null,
    countyAssessorCounty: null,
    countyAssessorState: null,
    countyAssessorSearchUrl: null,
    apnEvidence: [],
    sourceLinks: [],
  });
  assert.equal(parsed.apnCandidate, null);
});

test("site details research schema rejects non-url links", () => {
  assert.throws(() =>
    LocalSchema.parse({
      electricUtilityCandidate: {
        name: "PG&E",
        officialWebsite: "not-a-url",
        serviceUpgradeUrl: null,
        coverageSourceTitle: "Service territory",
        coverageSourceUrl: "https://www.pge.com/territory",
        coverageBasis: "ZIP",
        addressMatched: true,
        isElectric: true,
        explanation: "Source identifies electric territory.",
      },
      jurisdictionName: null,
      jurisdictionType: null,
      jurisdictionOfficialWebsite: null,
      countyAssessorCounty: null,
      countyAssessorState: null,
      countyAssessorSearchUrl: null,
      apnEvidence: [],
      apnCandidate: null,
      sourceLinks: [],
    }),
  );
});

test("site details research schema rejects apn candidate without source title", () => {
  assert.throws(() =>
    LocalSchema.parse({
      electricUtilityCandidate: null,
      jurisdictionName: null,
      jurisdictionType: null,
      jurisdictionOfficialWebsite: null,
      countyAssessorCounty: "Solano",
      countyAssessorState: "CA",
      countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
      apnEvidence: [],
      apnCandidate: {
        value: "0137-081-100",
        sourceTitle: "",
        sourceUrl: "https://www.redfin.com/example",
        addressMatched: true,
        apnShownOnSource: true,
        explanation: "APN appears on listing.",
      },
      sourceLinks: [],
    }),
  );
});

test("site details research schema rejects APN candidate missing explicit-source flag", () => {
  assert.throws(() =>
    LocalSchema.parse({
      electricUtilityCandidate: null,
      jurisdictionName: null,
      jurisdictionType: null,
      jurisdictionOfficialWebsite: null,
      countyAssessorCounty: "Solano",
      countyAssessorState: "CA",
      countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
      apnEvidence: [],
      apnCandidate: {
        value: "0137-081-100",
        sourceTitle: "Redfin",
        sourceUrl: "https://www.redfin.com/example",
        addressMatched: true,
        explanation: "APN appears on listing.",
      },
      sourceLinks: [],
    }),
  );
});
