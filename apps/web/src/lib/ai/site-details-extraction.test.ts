import assert from "node:assert/strict";
import test from "node:test";
import { extractSiteDetailsFromGroundedResearch } from "@/lib/ai/site-details-extraction";

test("extractSiteDetailsFromGroundedResearch parses source-id references without URL allowlist throw", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        electricUtilityCandidate: {
                          name: "PG&E",
                          coverageSourceId: "src_allowed",
                          coverageBasis: "CITY",
                          addressMatched: true,
                          isElectric: true,
                          explanation: "Coverage source supports utility.",
                        },
                        jurisdictionName: "City of Vacaville",
                        jurisdictionType: "CITY",
                        jurisdictionSourceId: "src_allowed",
                        countyAssessorCounty: "Solano",
                        countyAssessorState: "CA",
                        countyAssessorSourceId: "src_allowed",
                        apnEvidence: [
                          {
                            value: "0137-081-100",
                            sourceId: "src_unknown",
                            addressMatched: true,
                            apnShownOnSource: true,
                            explanation: "bad source id",
                          },
                        ],
                        apnCandidate: null,
                      }),
                    },
                  ],
                },
              },
            ],
          }),
      }) as Response) as typeof fetch;

    const parsed = await extractSiteDetailsFromGroundedResearch({
      apiKey: "test-key",
      model: "gemini-2.5-pro",
      timeoutMs: 1_000,
      addressLine: "401 Royal Tern Drive, Vacaville, CA 95687",
      missingScopes: ["APN"],
      groundedSummary: "summary",
      approvedSources: [
        {
          id: "src_allowed",
          title: "Allowed",
          url: "https://assessor.solanocounty.com/search",
          normalizedUrl: "https://assessor.solanocounty.com/search",
          domain: "assessor.solanocounty.com",
          supportText: [],
        },
      ],
    });
    assert.ok(parsed);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
