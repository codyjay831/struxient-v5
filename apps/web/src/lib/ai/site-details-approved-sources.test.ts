import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApprovedGroundedSources,
  getApprovedGroundedSourceById,
  normalizeGroundedSourceUrl,
} from "@/lib/ai/site-details-approved-sources";

test("buildApprovedGroundedSources creates deterministic source ids", () => {
  const sources = buildApprovedGroundedSources([
    {
      title: "City Utilities",
      url: "https://www.cityofvacaville.gov/government/utilities?utm_source=google",
    },
  ]);
  assert.equal(sources.length, 1);
  assert.match(sources[0]?.id ?? "", /^src_[a-f0-9]{8}$/);

  const again = buildApprovedGroundedSources([
    {
      title: "City Utilities",
      url: "https://www.cityofvacaville.gov/government/utilities",
    },
  ]);
  assert.equal(again[0]?.id, sources[0]?.id);
});

test("buildApprovedGroundedSources deduplicates equivalent tracking variants", () => {
  const sources = buildApprovedGroundedSources([
    {
      title: "A",
      url: "https://example.com/property?id=1&utm_campaign=test",
    },
    {
      title: "B",
      url: "https://example.com/property?id=1",
    },
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.normalizedUrl, "https://example.com/property?id=1");
});

test("buildApprovedGroundedSources preserves identity-bearing query params", () => {
  const sources = buildApprovedGroundedSources([
    { title: "One", url: "https://example.com/property?propertyId=1" },
    { title: "Two", url: "https://example.com/property?propertyId=2" },
  ]);
  assert.equal(sources.length, 2);
});

test("getApprovedGroundedSourceById rejects unknown id", () => {
  const sources = buildApprovedGroundedSources([
    { title: "One", url: "https://example.com/property?propertyId=1" },
  ]);
  assert.equal(getApprovedGroundedSourceById(sources, "src_unknown"), null);
});

test("normalizeGroundedSourceUrl drops fragments and tracking params only", () => {
  const normalized = normalizeGroundedSourceUrl(
    "https://Example.com:443/a/path/?id=1&utm_source=x#section",
  );
  assert.equal(normalized, "https://example.com/a/path?id=1");
});
