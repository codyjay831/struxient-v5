import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import {
  evaluateQuoteSendReadiness,
  type QuoteSendReadinessInput,
} from "./quote-send-readiness";
import {
  hasIssuedQuoteWithoutDraft,
  pickMostRecentDraftQuote,
  type OpportunityFlowQuoteInput,
} from "../opportunity-flow";

const now = new Date("2026-06-22T12:00:00.000Z");

function quoteInput(overrides: Partial<OpportunityFlowQuoteInput>): OpportunityFlowQuoteInput {
  return {
    id: "q-1",
    title: "Quote",
    status: QuoteStatus.DRAFT,
    lineItemCount: 0,
    totalCents: 0,
    createdAt: now,
    updatedAt: now,
    job: null,
    ...overrides,
  };
}

function readySendInput(overrides: Partial<QuoteSendReadinessInput> = {}): QuoteSendReadinessInput {
  return {
    status: QuoteStatus.DRAFT,
    lineItemCount: 2,
    serviceLocationId: "loc-1",
    paymentScheduleItemCount: 1,
    openScopeDecisionCount: 0,
    ...overrides,
  };
}

test("pickMostRecentDraftQuote returns only draft quotes", () => {
  const draft = quoteInput({ id: "draft-1", status: QuoteStatus.DRAFT });
  const sent = quoteInput({ id: "sent-1", status: QuoteStatus.SENT, updatedAt: new Date(now.getTime() + 1000) });
  assert.equal(pickMostRecentDraftQuote([sent, draft])?.id, "draft-1");
  assert.equal(pickMostRecentDraftQuote([sent]), null);
});

test("hasIssuedQuoteWithoutDraft is true when only sent or approved quotes exist", () => {
  assert.equal(
    hasIssuedQuoteWithoutDraft([quoteInput({ status: QuoteStatus.SENT })]),
    true,
  );
  assert.equal(
    hasIssuedQuoteWithoutDraft([
      quoteInput({ status: QuoteStatus.SENT }),
      quoteInput({ id: "draft", status: QuoteStatus.DRAFT }),
    ]),
    false,
  );
});

test("evaluateQuoteSendReadiness blocks incomplete drafts", () => {
  assert.equal(evaluateQuoteSendReadiness(readySendInput()).ok, true);
  assert.equal(
    evaluateQuoteSendReadiness(readySendInput({ lineItemCount: 0 })).ok,
    false,
  );
  assert.equal(
    evaluateQuoteSendReadiness(readySendInput({ serviceLocationId: null })).ok,
    false,
  );
  assert.equal(
    evaluateQuoteSendReadiness(readySendInput({ paymentScheduleItemCount: 0 })).ok,
    false,
  );
  assert.equal(
    evaluateQuoteSendReadiness(readySendInput({ openScopeDecisionCount: 2 })).ok,
    false,
  );
  assert.equal(
    evaluateQuoteSendReadiness(readySendInput({ status: QuoteStatus.SENT })).ok,
    false,
  );
});
