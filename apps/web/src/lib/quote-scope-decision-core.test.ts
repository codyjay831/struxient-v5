import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionStatus,
} from "@prisma/client";
import {
  applyQuoteScopeDecisionManualAction,
  type QuoteScopeDecisionTx,
} from "@/lib/quote-scope-decision-core";

type DecisionRow = {
  id: string;
  organizationId: string;
  quoteId: string;
  status: QuoteScopeDecisionStatus;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  quoteLineItemId: string | null;
  title: string;
  resolutionTiming: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
};

function createTx(rows: DecisionRow[]): QuoteScopeDecisionTx {
  return {
    quoteScopeDecision: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find(
          (row) =>
            row.id === where.id &&
            row.organizationId === where.organizationId &&
            row.quoteId === where.quoteId,
        ) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((item) => item.id === where.id);
        if (!row) throw new Error("Row not found");
        row.status = data.status as QuoteScopeDecisionStatus;
        row.resolutionTiming = (data.resolutionTiming as string | null | undefined) ?? row.resolutionTiming;
        row.resolvedAt = (data.resolvedAt as Date | null | undefined) ?? row.resolvedAt;
        row.resolvedByUserId =
          (data.resolvedByUserId as string | null | undefined) ?? row.resolvedByUserId;
        return row;
      },
    },
  } as unknown as QuoteScopeDecisionTx;
}

test("rejects bare resolve for required or legacy send-blocking gaps", async () => {
  const tx = createTx([
    {
      id: "d-1",
      organizationId: "org-1",
      quoteId: "quote-1",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      quoteLineItemId: "line-1",
      title: "Confirm exact square footage",
      resolutionTiming: null,
      resolvedAt: null,
      resolvedByUserId: null,
    },
  ]);

  const result = await applyQuoteScopeDecisionManualAction(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    decisionId: "d-1",
    action: "resolve",
    resolvedByUserId: "user-1",
  });

  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /Use Clarify Scope/i);
});

test("still allows dismiss and defer for send-blocking gaps", async () => {
  const rows: DecisionRow[] = [
    {
      id: "d-2",
      organizationId: "org-1",
      quoteId: "quote-1",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      quoteLineItemId: "line-1",
      title: "Legacy open gap",
      resolutionTiming: null,
      resolvedAt: null,
      resolvedByUserId: null,
    },
    {
      id: "d-3",
      organizationId: "org-1",
      quoteId: "quote-1",
      status: QuoteScopeDecisionStatus.OPEN,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      quoteLineItemId: "line-1",
      title: "Required gap",
      resolutionTiming: null,
      resolvedAt: null,
      resolvedByUserId: null,
    },
  ];
  const tx = createTx(rows);

  const deferResult = await applyQuoteScopeDecisionManualAction(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    decisionId: "d-2",
    action: "defer_to_execution",
    resolvedByUserId: "user-1",
  });
  const dismissResult = await applyQuoteScopeDecisionManualAction(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    decisionId: "d-3",
    action: "dismiss",
    resolvedByUserId: "user-1",
  });

  assert.equal(deferResult.ok, true);
  assert.equal(dismissResult.ok, true);
  assert.equal(rows[0].status, QuoteScopeDecisionStatus.DEFERRED);
  assert.equal(rows[1].status, QuoteScopeDecisionStatus.DISMISSED);
});
