import assert from "node:assert/strict";
import test from "node:test";
import { researchGroundedSiteDetailsSources } from "@/lib/ai/site-details-grounded-research";

test("researchGroundedSiteDetailsSources returns grounded links and queries", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      ({
        ok: true,
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "Grounded summary text." }] },
                groundingMetadata: {
                  webSearchQueries: ["401 Royal Tern Drive Vacaville APN"],
                  groundingChunks: [
                    { web: { title: "Redfin 401 Royal Tern", uri: "https://www.redfin.com/a" } },
                    { web: { title: "Solano Assessor", uri: "https://assessor.solanocounty.com/search" } },
                  ],
                  groundingSupports: [
                    {
                      segment: { text: "Pacific Gas and Electric Company serves this address." },
                      groundingChunkIndices: [0],
                    },
                  ],
                },
              },
            ],
          }),
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: "Grounded summary text." }] },
              groundingMetadata: {
                webSearchQueries: ["401 Royal Tern Drive Vacaville APN"],
                groundingChunks: [
                  { web: { title: "Redfin 401 Royal Tern", uri: "https://www.redfin.com/a" } },
                  { web: { title: "Solano Assessor", uri: "https://assessor.solanocounty.com/search" } },
                ],
                groundingSupports: [
                  {
                    segment: { text: "Pacific Gas and Electric Company serves this address." },
                    groundingChunkIndices: [0],
                  },
                ],
              },
            },
          ],
        }),
      }) as Response) as typeof fetch;

    const result = await researchGroundedSiteDetailsSources({
      apiKey: "test-key",
      model: "gemini-2.5-pro",
      prompt: "test prompt",
      timeoutMs: 1_000,
    });
    assert.equal(result.groundingToolEnabled, true);
    assert.equal(result.groundingMetadataPresent, true);
    assert.equal(result.groundingSearchQueries.length, 1);
    assert.equal(result.groundingSourceLinks.length, 2);
    assert.deepEqual(result.approvedSources[0]?.supportText, [
      "Pacific Gas and Electric Company serves this address.",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("researchGroundedSiteDetailsSources normalizes leading models/ in model id", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  try {
    globalThis.fetch = (async (input) => {
      calledUrl = String(input);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "Grounded summary text." }] },
                groundingMetadata: {
                  webSearchQueries: ["query"],
                  groundingChunks: [{ web: { title: "A", uri: "https://example.com/a" } }],
                },
              },
            ],
          }),
      } as Response;
    }) as typeof fetch;

    const result = await researchGroundedSiteDetailsSources({
      apiKey: "test-key",
      model: "models/gemini-2.5-flash",
      prompt: "test prompt",
      timeoutMs: 1_000,
    });

    assert.equal(result.originalModel, "models/gemini-2.5-flash");
    assert.equal(result.normalizedModel, "gemini-2.5-flash");
    assert.match(calledUrl, /\/v1beta\/models\/gemini-2\.5-flash:generateContent\?key=test-key$/);
    assert.doesNotMatch(calledUrl, /\/models\/models\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("researchGroundedSiteDetailsSources falls back when candidate text is missing", async () => {
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
                content: { role: "model" },
                groundingMetadata: {
                  webSearchQueries: ["vacaville utility"],
                  groundingChunks: [
                    { web: { title: "Vacaville Utility Notes", uri: "https://example.com/utility" } },
                  ],
                  groundingSupports: [
                    {
                      segment: { text: "PG&E serves most electric customers in Vacaville." },
                      groundingChunkIndices: [0],
                    },
                  ],
                },
              },
            ],
          }),
      }) as Response) as typeof fetch;

    const result = await researchGroundedSiteDetailsSources({
      apiKey: "test-key",
      model: "gemini-2.5-flash",
      prompt: "test prompt",
      timeoutMs: 1_000,
    });

    assert.equal(result.groundingMetadataPresent, true);
    assert.equal(result.approvedSources.length, 1);
    assert.equal(result.groundedSummary, "PG&E serves most electric customers in Vacaville.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
