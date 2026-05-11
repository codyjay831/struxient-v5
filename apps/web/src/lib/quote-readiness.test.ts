import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import { getQuoteReadiness } from "./quote-readiness";

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
