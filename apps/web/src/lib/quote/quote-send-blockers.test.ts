import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";
import {
  buildQuoteSendBlockers,
  countSendBlockingScopeDecisions,
  isSendBlockingScopeDecision,
  primaryQuoteSendBlockerMessage,
  type QuoteSendBlockerScopeDecision,
} from "./quote-send-blockers";

const baseInput = {
  status: QuoteStatus.DRAFT,
  lineItemCount: 2,
  serviceLocationId: "loc-1",
  paymentScheduleItemCount: 1,
  scopeDecisions: [] as QuoteSendBlockerScopeDecision[],
};

function decision(
  overrides: Partial<QuoteSendBlockerScopeDecision> & Pick<QuoteSendBlockerScopeDecision, "id">,
): QuoteSendBlockerScopeDecision {
  return {
    quoteLineItemId: null,
    status: QuoteScopeDecisionStatus.OPEN,
    quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    title: "Example gap",
    ...overrides,
  };
}

test("buildQuoteSendBlockers allows send when base requirements met and no gaps", () => {
  const result = buildQuoteSendBlockers(baseInput);
  assert.equal(result.canSend, true);
  assert.equal(result.blockers.length, 0);
});

test("buildQuoteSendBlockers blocks when no line items", () => {
  const result = buildQuoteSendBlockers({ ...baseInput, lineItemCount: 0 });
  assert.equal(result.canSend, false);
  assert.ok(result.blockers.some((b) => b.code === "NO_LINE_ITEMS"));
});

test("buildQuoteSendBlockers blocks OPEN REQUIRED scope gap", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    scopeDecisions: [
      decision({
        id: "d-req",
        quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
        title: "Exact square footage",
      }),
    ],
  });
  assert.equal(result.canSend, false);
  assert.ok(
    result.blockers.some(
      (b) => b.code === "REQUIRED_SCOPE_GAP_OPEN" && b.scopeDecisionId === "d-req",
    ),
  );
  assert.equal(result.blockers[0]?.actionTarget, "clarify");
});

test("buildQuoteSendBlockers blocks legacy OPEN + NONE scope gap", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    scopeDecisions: [
      decision({
        id: "d-legacy",
        quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
        title: "Preferred schedule",
      }),
    ],
  });
  assert.equal(result.canSend, false);
  assert.ok(
    result.blockers.some(
      (b) => b.code === "LEGACY_SCOPE_GAP_OPEN" && b.scopeDecisionId === "d-legacy",
    ),
  );
});

test("buildQuoteSendBlockers does not block DEFERRED scope decision", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    scopeDecisions: [
      decision({
        id: "d-deferred",
        status: QuoteScopeDecisionStatus.DEFERRED,
        quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
        title: "Crew assignment",
      }),
    ],
  });
  assert.equal(result.canSend, true);
  assert.equal(result.blockers.length, 0);
  assert.ok(result.warnings.some((w) => w.scopeDecisionId === "d-deferred"));
});

test("buildQuoteSendBlockers does not block DISMISSED scope decision", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    scopeDecisions: [
      decision({
        id: "d-dismissed",
        status: QuoteScopeDecisionStatus.DISMISSED,
        quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      }),
    ],
  });
  assert.equal(result.canSend, true);
  assert.equal(result.blockers.length, 0);
});

test("buildQuoteSendBlockers does not block RESOLVED scope decision", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    scopeDecisions: [
      decision({
        id: "d-resolved",
        status: QuoteScopeDecisionStatus.RESOLVED,
        quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      }),
    ],
  });
  assert.equal(result.canSend, true);
});

test("isSendBlockingScopeDecision legacy OPEN NONE is blocking", () => {
  assert.equal(
    isSendBlockingScopeDecision(
      decision({ id: "x", quoteImpact: QuoteScopeDecisionQuoteImpact.NONE }),
    ),
    true,
  );
});

test("countSendBlockingScopeDecisions ignores deferred and dismissed", () => {
  assert.equal(
    countSendBlockingScopeDecisions([
      decision({ id: "open", status: QuoteScopeDecisionStatus.OPEN }),
      decision({ id: "def", status: QuoteScopeDecisionStatus.DEFERRED }),
      decision({ id: "dis", status: QuoteScopeDecisionStatus.DISMISSED }),
    ]),
    1,
  );
});

test("primaryQuoteSendBlockerMessage aggregates multiple scope gaps", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    scopeDecisions: [
      decision({ id: "a", title: "Gap A" }),
      decision({ id: "b", title: "Gap B" }),
    ],
  });
  assert.equal(primaryQuoteSendBlockerMessage(result), "Clarify 2 scope gaps before sending.");
});

test("buildQuoteSendBlockers blocks non-draft quote status", () => {
  const result = buildQuoteSendBlockers({
    ...baseInput,
    status: QuoteStatus.SENT,
  });
  assert.equal(result.canSend, false);
  assert.ok(result.blockers.some((b) => b.code === "QUOTE_STATUS_NOT_SENDABLE"));
});
