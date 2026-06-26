import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";
import {
  countSendBlockingScopeDecisionsForLine,
  filterOpenScopeDecisions,
  filterSendBlockingScopeDecisions,
} from "@/lib/quote-scope-decision-display";
import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";
import { lineClarifyActionLabel } from "@/lib/quote/quote-clarify-scope-ui";
import { evaluateQuoteSendReadiness } from "@/lib/quote/quote-send-readiness";
import { getQuoteWorkflowPresentation } from "@/lib/quote-workflow-presenter";

function decision(
  overrides: Partial<QuoteScopeDecisionPayload> & Pick<QuoteScopeDecisionPayload, "id">,
): QuoteScopeDecisionPayload {
  return {
    quoteId: "quote-1",
    quoteLineItemId: overrides.quoteLineItemId ?? "line-a",
    sourceType: "QUICK_SCOPE",
    title: overrides.title ?? "Example gap",
    detail: null,
    status: overrides.status ?? QuoteScopeDecisionStatus.OPEN,
    resolutionTiming: null,
    quoteImpact: overrides.quoteImpact ?? QuoteScopeDecisionQuoteImpact.REQUIRED,
    ...overrides,
  };
}

const basePresentationInput = {
  quote: {
    status: QuoteStatus.DRAFT,
    lineItemCount: 2,
    subtotalCents: 10_000,
    totalCents: 10_000,
    jobsiteMissing: false,
  },
  job: null,
  activationReadiness: { ready: false, totalTasksToActivate: 0, blockReasons: [] },
  isCommercialEditable: true,
  paymentScheduleItemCount: 2,
  scopeDecisions: [] as QuoteScopeDecisionPayload[],
  activityItems: [],
};

test("Slice 2A: line with open scope decisions still gets primary Clarify (N) label", () => {
  const scopeDecisions = [
    decision({ id: "gap-1", quoteLineItemId: "line-a" }),
    decision({ id: "gap-2", quoteLineItemId: "line-a" }),
  ];
  const blockingCount = countSendBlockingScopeDecisionsForLine(scopeDecisions, "line-a");
  assert.equal(blockingCount, 2);
  assert.equal(lineClarifyActionLabel(blockingCount), "Clarify (2)");
});

test("Slice 2A: deferred scope decisions are not send blockers", () => {
  const scopeDecisions = [
    decision({
      id: "def-1",
      status: QuoteScopeDecisionStatus.DEFERRED,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    }),
  ];
  assert.equal(filterSendBlockingScopeDecisions(scopeDecisions).length, 0);

  const presentation = getQuoteWorkflowPresentation({
    ...basePresentationInput,
    scopeDecisions,
  });
  assert.equal(presentation.canSend, true);
  assert.equal(presentation.blockers.length, 0);
  assert.ok(presentation.sendWarnings.length > 0);
});

test("Slice 2A: blocking scope decisions route readiness toward Clarify", () => {
  const scopeDecisions = [decision({ id: "gap-1", quoteLineItemId: "line-a" })];
  const presentation = getQuoteWorkflowPresentation({
    ...basePresentationInput,
    scopeDecisions,
  });

  assert.equal(presentation.canSend, false);
  assert.ok(presentation.blockers.some((b) => /clarify scope/i.test(b.message)));
  assert.ok(presentation.blockers.some((b) => b.fixTab === "scope"));
});

test("Slice 2A: OPEN rows are still enumerable for Clarify context", () => {
  const scopeDecisions = [
    decision({
      id: "open-none-1",
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      title: "Schedule preference",
    }),
  ];
  const open = filterOpenScopeDecisions(scopeDecisions);
  assert.equal(open.length, 1);
  assert.equal(filterSendBlockingScopeDecisions(open).length, 0);
});

test("Slice 2A: canSend display stays aligned with Slice 1 server readiness", () => {
  const scopeDecisions = [
    decision({ id: "open-1" }),
    decision({
      id: "def-1",
      status: QuoteScopeDecisionStatus.DEFERRED,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    }),
  ];
  const presentation = getQuoteWorkflowPresentation({
    ...basePresentationInput,
    scopeDecisions,
  });
  const readiness = evaluateQuoteSendReadiness({
    status: QuoteStatus.DRAFT,
    lineItemCount: 2,
    serviceLocationId: "jobsite",
    paymentScheduleItemCount: 2,
    scopeDecisions,
  });
  assert.equal(presentation.canSend, readiness.ok);
});

test("Slice 2A: OPEN NONE rows do not block send", () => {
  const scopeDecisions = [
    decision({
      id: "open-none-row",
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      title: "Scheduling note",
    }),
  ];
  assert.equal(filterOpenScopeDecisions(scopeDecisions).length, 1);
  assert.equal(
    evaluateQuoteSendReadiness({
      status: QuoteStatus.DRAFT,
      lineItemCount: 2,
      serviceLocationId: "jobsite",
      paymentScheduleItemCount: 2,
      scopeDecisions,
    }).ok,
    true,
  );
});
