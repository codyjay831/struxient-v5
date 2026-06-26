import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionResolutionTiming,
  QuoteScopeDecisionSourceType,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";
import { mapCommercialSuggestionToLineFields } from "@/lib/ai/quote-scope-suggestion-persist";
import {
  createQuoteScopeDecisionsFromMissingInfoStrings,
  type QuoteScopeDecisionTx,
} from "@/lib/quote-scope-decision-core";
import { QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE } from "@/lib/quote/quote-scope-gap-classifier";

type DecisionRow = {
  id: string;
  organizationId: string;
  quoteId: string;
  quoteLineItemId: string | null;
  sourceType: QuoteScopeDecisionSourceType;
  title: string;
  detail: string | null;
  status: QuoteScopeDecisionStatus;
  quoteImpact: QuoteScopeDecisionQuoteImpact;
  resolutionTiming: QuoteScopeDecisionResolutionTiming | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
};

type LineRow = {
  id: string;
  quoteId: string;
  description: string;
  internalNotes: string | null;
  lineTotalCents: number;
};

function createApplyMockTx(input: {
  quoteId: string;
  organizationId: string;
}) {
  const decisions: DecisionRow[] = [];
  const lines: LineRow[] = [];
  let decisionId = 1;
  let lineId = 1;

  const tx = {
    quote: {
      findFirst: async () => ({
        id: input.quoteId,
        internalNotes: null,
      }),
      updateMany: async () => ({ count: 1 }),
    },
    quoteLineItem: {
      aggregate: async () => ({ _max: { sortOrder: lines.length - 1 } }),
      findMany: async () => lines.map((row) => ({ lineTotalCents: row.lineTotalCents })),
      create: async ({
        data,
      }: {
        data: {
          quoteId: string;
          description: string;
          internalNotes: string | null;
          lineTotalCents?: number;
        };
      }) => {
        const row: LineRow = {
          id: `line-${lineId++}`,
          quoteId: data.quoteId,
          description: data.description,
          internalNotes: data.internalNotes,
          lineTotalCents: data.lineTotalCents ?? 0,
        };
        lines.push(row);
        return { id: row.id };
      },
    },
    quoteScopeDecision: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        decisions.filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) return false;
          if (where.quoteId && row.quoteId !== where.quoteId) return false;
          if (
            where.quoteLineItemId !== undefined &&
            row.quoteLineItemId !== where.quoteLineItemId
          ) {
            return false;
          }
          const statusFilter = where.status as { in?: string[] } | undefined;
          if (statusFilter?.in && !statusFilter.in.includes(row.status)) return false;
          return true;
        }),
      create: async ({ data }: { data: Omit<DecisionRow, "id"> }) => {
        const row: DecisionRow = {
          id: `decision-${decisionId++}`,
          ...data,
        };
        decisions.push(row);
        return { id: row.id };
      },
    },
    _decisions: decisions,
    _lines: lines,
  };

  return tx;
}

test("mapCommercialSuggestionToLineFields does not append missingInfo to internalNotes", () => {
  const fields = mapCommercialSuggestionToLineFields({
    tempId: "c1",
    description: "Panel upgrade",
    lineItemDetails: [
      {
        tempId: "d1",
        content: "Existing Zinsco panel",
        audience: "internal",
      },
    ],
    executionPlanningNotes: ["Coordinate utility disconnect"],
    missingInfo: ["Confirm existing service size"],
  });

  const notes = fields.internalNotes ?? "";
  assert.match(notes, /Line-specific details:/);
  assert.match(notes, /Execution planning notes:/);
  assert.match(notes, /Coordinate utility disconnect/);
  assert.doesNotMatch(notes, /Missing info \(this line\):/);
  assert.doesNotMatch(notes, /Confirm existing service size/);
});

test("createQuoteScopeDecisionsFromMissingInfoStrings classifies and sets stable source metadata", async () => {
  const tx = createApplyMockTx({ quoteId: "quote-1", organizationId: "org-1" });

  await createQuoteScopeDecisionsFromMissingInfoStrings(tx as QuoteScopeDecisionTx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: "line-1",
    missingInfo: ["Confirm existing service size", "Preferred project timeline"],
    parentSourceRefId: "c1",
  });

  assert.equal(tx._decisions.length, 2);

  const commercial = tx._decisions.find((row) => row.title.includes("service size"));
  assert.ok(commercial);
  assert.equal(commercial.quoteImpact, QuoteScopeDecisionQuoteImpact.REQUIRED);
  assert.equal(commercial.status, QuoteScopeDecisionStatus.OPEN);
  assert.equal(commercial.sourceRefType, QUICK_SCOPE_MISSING_INFO_SOURCE_REF_TYPE);
  assert.match(commercial.sourceRefId ?? "", /^c1:/);

  const scheduling = tx._decisions.find((row) => row.title.includes("timeline"));
  assert.ok(scheduling);
  assert.equal(scheduling.status, QuoteScopeDecisionStatus.DEFERRED);
  assert.equal(scheduling.resolutionTiming, QuoteScopeDecisionResolutionTiming.EXECUTION);
});

test("OPEN NONE does not block send helper after legacy cleanup", async () => {
  const { buildQuoteSendBlockers, isSendBlockingScopeDecision } = await import(
    "@/lib/quote/quote-send-blockers"
  );
  const schedulingOnlyGap = {
    id: "gap-none-1",
    quoteLineItemId: "line-1",
    status: QuoteScopeDecisionStatus.OPEN,
    quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    title: "Scheduling preference",
  };
  assert.equal(isSendBlockingScopeDecision(schedulingOnlyGap), false);
  const send = buildQuoteSendBlockers({
    status: QuoteStatus.DRAFT,
    lineItemCount: 1,
    serviceLocationId: "loc-1",
    paymentScheduleItemCount: 1,
    scopeDecisions: [schedulingOnlyGap],
  });
  assert.equal(send.canSend, true);
});
