import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScopeDecisionPreviewChips,
  countSendBlockingScopeDecisionsForLine,
  filterLineScopeDecisions,
  filterOpenScopeDecisions,
  filterQuoteWideScopeDecisions,
  filterSendBlockingScopeDecisions,
  formatScopeDecisionForAiContext,
  scopeDecisionPreviewChip,
} from "@/lib/quote-scope-decision-display";
import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";
import { QuoteScopeDecisionQuoteImpact, QuoteScopeDecisionStatus } from "@prisma/client";

function decision(
  overrides: Partial<QuoteScopeDecisionPayload> & Pick<QuoteScopeDecisionPayload, "title">,
): QuoteScopeDecisionPayload {
  return {
    id: overrides.id ?? "decision-1",
    quoteId: overrides.quoteId ?? "quote-1",
    quoteLineItemId: overrides.quoteLineItemId ?? null,
    sourceType: overrides.sourceType ?? "QUICK_SCOPE",
    title: overrides.title,
    detail: overrides.detail ?? null,
    status: overrides.status ?? "OPEN",
    resolutionTiming: overrides.resolutionTiming ?? null,
    quoteImpact: overrides.quoteImpact ?? "NONE",
  };
}

test("scopeDecisionPreviewChip strips common prefixes and shortens long titles", () => {
  assert.equal(scopeDecisionPreviewChip("Confirm gutter color"), "gutter color");
  assert.equal(scopeDecisionPreviewChip("Verify fascia condition on rear elevation"), "fascia condition on");
  assert.equal(scopeDecisionPreviewChip("Material"), "Material");
});

test("buildScopeDecisionPreviewChips dedupes and caps chip count", () => {
  const chips = buildScopeDecisionPreviewChips(
    [
      decision({ title: "Confirm gutter color" }),
      decision({ id: "decision-2", title: "Confirm gutter material" }),
      decision({ id: "decision-3", title: "Measure linear footage" }),
      decision({ id: "decision-4", title: "Verify fascia condition" }),
      decision({ id: "decision-5", title: "Confirm downspout count" }),
    ],
    3,
  );
  assert.equal(chips.length, 3);
});

test("filter helpers split quote-wide and line-level decisions", () => {
  const decisions = [
    decision({ title: "Confirm access gate code", quoteLineItemId: null }),
    decision({ id: "line-1", title: "Confirm color", quoteLineItemId: "line-a" }),
  ];
  assert.equal(filterQuoteWideScopeDecisions(decisions).length, 1);
  assert.equal(filterLineScopeDecisions(decisions, "line-a").length, 1);
  assert.equal(filterLineScopeDecisions(decisions, "line-b").length, 0);
});

test("formatScopeDecisionForAiContext includes detail when present", () => {
  assert.equal(
    formatScopeDecisionForAiContext({
      title: "Desired gutter color unknown",
      detail: null,
    }),
    "Desired gutter color unknown",
  );
  assert.equal(
    formatScopeDecisionForAiContext({
      title: "Fascia condition unknown",
      detail: "Rear elevation only",
    }),
    "Fascia condition unknown — Rear elevation only",
  );
});

test("filterSendBlockingScopeDecisions excludes DEFERRED and DISMISSED", () => {
  const decisions = [
    decision({ id: "open-req", quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED }),
    decision({
      id: "legacy-none",
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      title: "Legacy gap",
    }),
    decision({
      id: "deferred",
      status: QuoteScopeDecisionStatus.DEFERRED,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    }),
    decision({
      id: "dismissed",
      status: QuoteScopeDecisionStatus.DISMISSED,
    }),
  ];
  const blocking = filterSendBlockingScopeDecisions(decisions);
  assert.equal(blocking.length, 2);
  assert.deepEqual(
    blocking.map((d) => d.id),
    ["open-req", "legacy-none"],
  );
});

test("countSendBlockingScopeDecisionsForLine counts only blocking rows on one line", () => {
  const decisions = [
    decision({ id: "line-a-1", quoteLineItemId: "line-a" }),
    decision({
      id: "line-a-def",
      quoteLineItemId: "line-a",
      status: QuoteScopeDecisionStatus.DEFERRED,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    }),
    decision({ id: "line-b-1", quoteLineItemId: "line-b" }),
  ];
  assert.equal(countSendBlockingScopeDecisionsForLine(decisions, "line-a"), 1);
  assert.equal(countSendBlockingScopeDecisionsForLine(decisions, "line-b"), 1);
  assert.equal(countSendBlockingScopeDecisionsForLine(decisions, "line-c"), 0);
});

test("filterOpenScopeDecisions returns OPEN rows for legacy compatibility UI", () => {
  const decisions = [
    decision({ id: "open-1" }),
    decision({ id: "def-1", status: QuoteScopeDecisionStatus.DEFERRED }),
  ];
  assert.equal(filterOpenScopeDecisions(decisions).length, 1);
  assert.equal(filterOpenScopeDecisions(decisions)[0]?.id, "open-1");
});
