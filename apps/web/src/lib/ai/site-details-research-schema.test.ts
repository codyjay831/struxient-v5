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
      sourceLinks: [],
    }),
  );
});
