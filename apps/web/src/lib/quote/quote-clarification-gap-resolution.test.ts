import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";
import type { ClarificationAnswer } from "@/lib/clarification/clarification-types";
import { buildQuoteSendBlockers } from "@/lib/quote/quote-send-blockers";
import { applyQuoteScopeDecisionManualAction } from "@/lib/quote-scope-decision-core";
import { resolveMatchingScopeDecisionsForClarificationApply } from "./quote-clarification-gap-resolution";

type DecisionRow = {
  id: string;
  organizationId: string;
  quoteId: string;
  quoteLineItemId: string | null;
  title: string;
  detail: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  status: QuoteScopeDecisionStatus;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  resolutionTiming: null | "NOT_NEEDED" | "EXECUTION";
  resolvedByUserId: string | null;
  resolvedByClarificationId: string | null;
};

function makeAnswer(value: ClarificationAnswer["value"]): ClarificationAnswer {
  return {
    questionSetKey: "set-1",
    questionSetVersion: 1,
    questionKey: "windows.count",
    questionLabelSnapshot: "Window count needed",
    inputType: "short_text",
    value,
    customerFacing: true,
  };
}

function createMockTx(rows: DecisionRow[]) {
  return {
    quoteScopeDecision: {
      findMany: async ({ where }: { where: { organizationId: string; quoteId: string } }) =>
        rows
          .filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.quoteId === where.quoteId &&
              row.status === QuoteScopeDecisionStatus.OPEN,
          )
          .map((row) => ({
            id: row.id,
            quoteLineItemId: row.quoteLineItemId,
            title: row.title,
            detail: row.detail,
            sourceRefType: row.sourceRefType,
            sourceRefId: row.sourceRefId,
          })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] }; organizationId: string; quoteId: string; status: "OPEN" };
        data: {
          status: "RESOLVED";
          resolutionTiming: null;
          resolvedByClarificationId: string;
          resolvedByUserId: string | null;
        };
      }) => {
        let count = 0;
        for (const row of rows) {
          if (
            row.organizationId === where.organizationId &&
            row.quoteId === where.quoteId &&
            where.id.in.includes(row.id) &&
            row.status === QuoteScopeDecisionStatus.OPEN
          ) {
            row.status = QuoteScopeDecisionStatus.RESOLVED;
            row.resolutionTiming = data.resolutionTiming;
            row.resolvedByClarificationId = data.resolvedByClarificationId;
            row.resolvedByUserId = data.resolvedByUserId;
            count += 1;
          }
        }
        return { count };
      },
      findFirst: async ({ where }: { where: { id: string; organizationId: string; quoteId: string } }) =>
        rows.find(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            row.quoteId === where.quoteId,
        ) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: QuoteScopeDecisionStatus; resolutionTiming: DecisionRow["resolutionTiming"] };
      }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error("Decision missing");
        row.status = data.status;
        row.resolutionTiming = data.resolutionTiming;
        return row;
      },
    },
  };
}

function buildCanSend(rows: DecisionRow[]): boolean {
  return buildQuoteSendBlockers({
    status: QuoteStatus.DRAFT,
    lineItemCount: 1,
    serviceLocationId: "loc-1",
    paymentScheduleItemCount: 1,
    scopeDecisions: rows.map((row) => ({
      id: row.id,
      quoteLineItemId: row.quoteLineItemId,
      status: row.status,
      quoteImpact: row.quoteImpact,
      resolutionTiming: row.resolutionTiming,
      title: row.title,
    })),
  }).canSend;
}

test("unknown apply does not resolve matching gap and blocker remains", async () => {
  const rows: DecisionRow[] = [
    {
      id: "gap-1",
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteLineItemId: "line-1",
      title: "Window count needed",
      detail: null,
      sourceRefType: "clarification_question",
      sourceRefId: "set-1:windows.count",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      resolutionTiming: null,
      resolvedByUserId: null,
      resolvedByClarificationId: null,
    },
  ];
  const tx = createMockTx(rows);
  assert.equal(buildCanSend(rows), false);

  const result = await resolveMatchingScopeDecisionsForClarificationApply(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [makeAnswer({ kind: "unknown" })],
    clarificationId: "clar-1",
    resolvedByUserId: "user-1",
  });

  assert.equal(result.resolvedGapCount, 0);
  assert.equal(rows[0]?.status, QuoteScopeDecisionStatus.OPEN);
  assert.equal(rows[0]?.resolvedByClarificationId, null);
  assert.equal(buildCanSend(rows), false);
});

test("truth-bearing apply resolves matching gap and unblocks send", async () => {
  const rows: DecisionRow[] = [
    {
      id: "gap-2",
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteLineItemId: "line-1",
      title: "Window count needed",
      detail: null,
      sourceRefType: "clarification_question",
      sourceRefId: "set-1:windows.count",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      resolutionTiming: null,
      resolvedByUserId: null,
      resolvedByClarificationId: null,
    },
  ];
  const tx = createMockTx(rows);
  assert.equal(buildCanSend(rows), false);

  const result = await resolveMatchingScopeDecisionsForClarificationApply(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    lineId: "line-1",
    questionSetKey: "set-1",
    answers: [makeAnswer({ kind: "text", text: "12 windows" })],
    clarificationId: "clar-2",
    resolvedByUserId: "user-1",
  });

  assert.equal(result.resolvedGapCount, 1);
  assert.equal(rows[0]?.status, QuoteScopeDecisionStatus.RESOLVED);
  assert.equal(rows[0]?.resolvedByClarificationId, "clar-2");
  assert.equal(buildCanSend(rows), true);
});

test("explicit not needed/dismiss/defer remain available while resolve stays blocked", async () => {
  const rows: DecisionRow[] = [
    {
      id: "gap-3",
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteLineItemId: "line-1",
      title: "Ambiguous commercial gap",
      detail: null,
      sourceRefType: null,
      sourceRefId: null,
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.POSSIBLE,
      resolutionTiming: null,
      resolvedByUserId: null,
      resolvedByClarificationId: null,
    },
  ];
  const tx = createMockTx(rows);

  const resolveAttempt = await applyQuoteScopeDecisionManualAction(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    decisionId: "gap-3",
    action: "resolve" as never,
    resolvedByUserId: "user-1",
  });
  assert.equal(resolveAttempt.ok, false);
  assert.match(resolveAttempt.error, /no longer supported/i);
  assert.equal(rows[0]?.status, QuoteScopeDecisionStatus.OPEN);

  const dismissAttempt = await applyQuoteScopeDecisionManualAction(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    decisionId: "gap-3",
    action: "dismiss",
    resolvedByUserId: "user-1",
  });
  assert.equal(dismissAttempt.ok, true);
  assert.equal(rows[0]?.status, QuoteScopeDecisionStatus.DISMISSED);

  rows[0].status = QuoteScopeDecisionStatus.OPEN;
  const deferAttempt = await applyQuoteScopeDecisionManualAction(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    decisionId: "gap-3",
    action: "defer_to_execution",
    resolvedByUserId: "user-1",
  });
  assert.equal(deferAttempt.ok, true);
  assert.equal(rows[0]?.status, QuoteScopeDecisionStatus.DEFERRED);
});
