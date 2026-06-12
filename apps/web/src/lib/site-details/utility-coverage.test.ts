import assert from "node:assert/strict";
import test from "node:test";
import {
  findUtilityCoverageMatches,
  pickBestCoverageMatch,
} from "@/lib/site-details/utility-coverage";

test("findUtilityCoverageMatches sorts by ZIP then confidence", async () => {
  const db = {
    utilityCoverage: {
      findMany: async () => [
        {
          utilityId: "u-1",
          coverageType: "CITY",
          coverageValue: "Vacaville",
          sourceTitle: "City source",
          sourceUrl: "https://example.com/city",
          confidence: "HIGH",
        },
        {
          utilityId: "u-1",
          coverageType: "ZIP",
          coverageValue: "95687",
          sourceTitle: "Zip source",
          sourceUrl: "https://example.com/zip",
          confidence: "MEDIUM",
        },
      ],
    },
  } as const;

  const matches = await findUtilityCoverageMatches(
    db as unknown as Parameters<typeof findUtilityCoverageMatches>[0],
    {
      organizationId: "org-1",
      utilityId: "u-1",
      location: {
        postalCode: "95687",
        city: "Vacaville",
        state: "CA",
        county: "Solano",
      },
    },
  );

  assert.equal(matches[0]?.coverageType, "ZIP");
  assert.equal(pickBestCoverageMatch(matches)?.sourceUrl, "https://example.com/zip");
});
