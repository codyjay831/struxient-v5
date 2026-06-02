import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteScopeCaptureContext } from "./quote-scope-capture-context";

test("buildQuoteScopeCaptureContext merges capture text and stored sources", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "Need 240V charger in garage",
    quoteInternalNotes: "Customer wants Tesla wall connector",
    leadScopeSummary: "EV charger install",
    leadNotes:
      "[Public Intake Form]\nWhat you need help with: Install charger in garage\nRequest type: Electrical",
    sources: {
      includeIntakeNotes: true,
      includeInternalQuoteNotes: true,
      includeScopeSummary: true,
    },
  });

  assert.ok(context);
  assert.match(context!, /Work description/i);
  assert.match(context!, /Internal quote notes/i);
  assert.match(context!, /Lead scope summary/i);
  assert.match(context!, /Intake \/ customer notes/i);
});

test("buildQuoteScopeCaptureContext respects source opt-out flags", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "Panel upgrade",
    quoteInternalNotes: "Should not appear",
    leadNotes: "Should not appear either",
    sources: {
      includeIntakeNotes: false,
      includeInternalQuoteNotes: false,
      includeScopeSummary: false,
    },
  });

  assert.ok(context);
  assert.match(context!, /Work description/i);
  assert.doesNotMatch(context!, /Internal quote notes/i);
  assert.doesNotMatch(context!, /Intake/i);
});

test("buildQuoteScopeCaptureContext returns undefined when empty", () => {
  const context = buildQuoteScopeCaptureContext({
    captureText: "   ",
    sources: {
      includeIntakeNotes: false,
      includeInternalQuoteNotes: false,
      includeScopeSummary: false,
    },
  });
  assert.equal(context, undefined);
});
