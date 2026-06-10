import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

const LocalSchema = z.object({
  utilityName: z.string().trim().min(1).nullable(),
  utilityOfficialWebsite: z.string().url().nullable(),
  utilityServiceUpgradeUrl: z.string().url().nullable(),
  jurisdictionName: z.string().trim().min(1).nullable(),
  jurisdictionType: z
    .enum(["CITY", "COUNTY", "UNINCORPORATED_COUNTY", "DISTRICT"])
    .nullable(),
  jurisdictionOfficialWebsite: z.string().url().nullable(),
  countyAssessorCounty: z.string().trim().min(1).nullable(),
  countyAssessorState: z.string().trim().min(1).nullable(),
  countyAssessorSearchUrl: z.string().url().nullable(),
  apnCandidate: z
    .object({
      value: z.string().trim().min(1),
      sourceTitle: z.string().trim().min(1),
      sourceUrl: z.string().url(),
      addressMatched: z.boolean(),
      explanation: z.string().trim().min(1).max(500),
    })
    .nullable(),
  sourceLinks: z.array(z.object({ title: z.string(), url: z.string().url() })).default([]),
});

test("site details research schema accepts nullable known fields", () => {
  const parsed = LocalSchema.parse({
    utilityName: null,
    utilityOfficialWebsite: null,
    utilityServiceUpgradeUrl: null,
    jurisdictionName: null,
    jurisdictionType: null,
    jurisdictionOfficialWebsite: null,
    countyAssessorCounty: null,
    countyAssessorState: null,
    countyAssessorSearchUrl: null,
    apnCandidate: {
      value: "0137-081-100",
      sourceTitle: "Redfin",
      sourceUrl: "https://www.redfin.com/example",
      addressMatched: true,
      explanation: "Listing page explicitly shows APN for the exact address.",
    },
    sourceLinks: [],
  });
  assert.equal(parsed.utilityName, null);
});

test("site details research schema rejects non-url links", () => {
  assert.throws(() =>
    LocalSchema.parse({
      utilityName: "PG&E",
      utilityOfficialWebsite: "not-a-url",
      utilityServiceUpgradeUrl: null,
      jurisdictionName: null,
      jurisdictionType: null,
      jurisdictionOfficialWebsite: null,
      countyAssessorCounty: null,
      countyAssessorState: null,
      countyAssessorSearchUrl: null,
      apnCandidate: null,
      sourceLinks: [],
    }),
  );
});

test("site details research schema rejects apn candidate without source title", () => {
  assert.throws(() =>
    LocalSchema.parse({
      utilityName: null,
      utilityOfficialWebsite: null,
      utilityServiceUpgradeUrl: null,
      jurisdictionName: null,
      jurisdictionType: null,
      jurisdictionOfficialWebsite: null,
      countyAssessorCounty: "Solano",
      countyAssessorState: "CA",
      countyAssessorSearchUrl: "https://assessor.solanocounty.com/search",
      apnCandidate: {
        value: "0137-081-100",
        sourceTitle: "",
        sourceUrl: "https://www.redfin.com/example",
        addressMatched: true,
        explanation: "APN appears on listing.",
      },
      sourceLinks: [],
    }),
  );
});
