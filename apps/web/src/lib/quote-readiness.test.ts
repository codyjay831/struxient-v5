import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import { getQuoteReadiness, resolveQuoteReadinessActionHref } from "./quote-readiness";

const baseQuote = {
  status: QuoteStatus.SENT,
  lineItemCount: 2,
  subtotalCents: 10_000,
  totalCents: 10_000,
};

test("getQuoteReadiness surfaces restore to draft when sent quote drifted after proof", () => {
  const readiness = getQuoteReadiness({
    quote: baseQuote,
    job: null,
    activationReadiness: null,
    revisionDriftSinceLastProof: true,
  });

  assert.equal(readiness.state, "SENT_AWAITING_CUSTOMER");
  assert.equal(readiness.secondaryAction?.kind, "RESTORE_TO_DRAFT");
  assert.match(readiness.description, /commercial proof/i);
});

test("getQuoteReadiness keeps proposal preview when sent quote has no drift", () => {
  const readiness = getQuoteReadiness({
    quote: baseQuote,
    job: null,
    activationReadiness: null,
    revisionDriftSinceLastProof: false,
  });

  assert.equal(readiness.secondaryAction?.kind, "OPEN_PROPOSAL_PREVIEW");
});

test("getQuoteReadiness surfaces restore to draft when approved quote drifted after proof", () => {
  const readiness = getQuoteReadiness({
    quote: { ...baseQuote, status: QuoteStatus.APPROVED },
    job: null,
    activationReadiness: {
      ready: true,
      totalTasksToActivate: 3,
      needsAttentionLineCount: 0,
      anomalyLineCount: 0,
    },
    revisionDriftSinceLastProof: true,
  });

  assert.equal(readiness.state, "APPROVED_READY_TO_ACTIVATE");
  assert.equal(readiness.secondaryAction?.kind, "RESTORE_TO_DRAFT");
});

test("resolveQuoteReadinessActionHref uses opportunity quote tab for linked authoring actions", () => {
  assert.equal(
    resolveQuoteReadinessActionHref(
      { kind: "ADD_LINE_ITEM", label: "Add line item" },
      { quoteId: "q-1", leadId: "lead-1" },
    ),
    "/leads/lead-1?tab=quote#line-items",
  );
  assert.equal(
    resolveQuoteReadinessActionHref(
      { kind: "SEND_QUOTE", label: "Send quote" },
      { quoteId: "q-1", leadId: "lead-1" },
    ),
    "/leads/lead-1?tab=quote#commercial-send-acceptance",
  );
  assert.equal(
    resolveQuoteReadinessActionHref(
      { kind: "RESTORE_TO_DRAFT", label: "Restore to draft" },
      { quoteId: "q-1", leadId: "lead-1" },
    ),
    "/leads/lead-1?tab=quote#archive-restore",
  );
});

test("resolveQuoteReadinessActionHref preserves quote deep routes and unlinked fallback", () => {
  assert.equal(
    resolveQuoteReadinessActionHref(
      { kind: "OPEN_EXECUTION_REVIEW", label: "Build execution plan" },
      { quoteId: "q-1", leadId: "lead-1" },
    ),
    "/quotes/q-1/execution-review",
  );
  assert.equal(
    resolveQuoteReadinessActionHref(
      { kind: "CONTINUE_EDITING", label: "Continue editing" },
      { quoteId: "q-1" },
    ),
    "/quotes/q-1#line-items",
  );
});
