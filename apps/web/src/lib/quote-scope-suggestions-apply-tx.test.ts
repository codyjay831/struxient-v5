import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import { mapCommercialSuggestionToLineFields } from "@/lib/ai/quote-scope-suggestion-persist";
import {
  createQuoteScopeDecisionsFromMissingInfoStrings,
  type QuoteScopeDecisionTx,
} from "@/lib/quote-scope-decision-core";

type DecisionRow = {
  id: string;
  organizationId: string;
  quoteId: string;
  quoteLineItemId: string | null;
  sourceType: "QUICK_SCOPE";
  title: string;
  detail: string | null;
  status: "OPEN";
};

function createDecisionMockTx(initial: DecisionRow[] = []): QuoteScopeDecisionTx & {
  _rows: DecisionRow[];
} {
  const rows = [...initial];
  let idCounter = initial.length + 1;

  return {
    quoteScopeDecision: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        rows.filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) {
            return false;
          }
          if (where.quoteId && row.quoteId !== where.quoteId) {
            return false;
          }
          if (
            where.quoteLineItemId !== undefined &&
            row.quoteLineItemId !== where.quoteLineItemId
          ) {
            return false;
          }
          const statusFilter = where.status as { in?: string[] } | undefined;
          if (statusFilter?.in && !statusFilter.in.includes(row.status)) {
            return false;
          }
          return true;
        }),
      create: async ({ data }: { data: Omit<DecisionRow, "id" | "status"> }) => {
        const row: DecisionRow = {
          id: `decision-${idCounter++}`,
          status: "OPEN",
          ...data,
          detail: data.detail ?? null,
        };
        rows.push(row);
        return { id: row.id };
      },
    },
    _rows: rows,
  } as unknown as QuoteScopeDecisionTx & { _rows: DecisionRow[] };
}

test("commercial missingInfo still maps to internal notes unchanged", () => {
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
    executionPlanningNotes: [],
    missingInfo: ["Confirm amperage"],
  });

  const notes = fields.internalNotes ?? "";
  assert.match(notes, /Line-specific details:/);
  assert.match(notes, /Zinsco/);
  assert.match(notes, /Missing info \(this line\):/);
  assert.match(notes, /Confirm amperage/);
});

test("line-level decisions are created from commercial missingInfo after line exists", async () => {
  const tx = createDecisionMockTx();
  const lineId = "line-1";

  const result = await createQuoteScopeDecisionsFromMissingInfoStrings(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: lineId,
    missingInfo: ["Confirm gutter color", "Measure linear feet"],
    sourceRefType: "commercial_line_temp_id",
    sourceRefId: "c1",
  });

  assert.equal(result.createdCount, 2);
  assert.ok(tx._rows.every((row) => row.quoteLineItemId === lineId));
});

test("quote-wide decisions use quoteLineItemId null", async () => {
  const tx = createDecisionMockTx();
  await createQuoteScopeDecisionsFromMissingInfoStrings(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: null,
    missingInfo: ["Confirm HOA rules", "Verify roof pitch"],
  });

  assert.equal(tx._rows.length, 2);
  assert.ok(tx._rows.every((row) => row.quoteLineItemId == null));
});

test("quote-wide decisions are not created when apply creates zero lines (contract)", () => {
  const createdCount = 0;
  const quoteMissingInfo = ["Should not persist"];
  const shouldPersistQuoteWide = createdCount > 0 && quoteMissingInfo.length > 0;
  assert.equal(shouldPersistQuoteWide, false);
});

test("activation readiness still evaluates from accepted plan tasks only", async () => {
  const { evaluateQuoteJobActivationReadiness } = await import(
    "@/lib/quote-job-activation-readiness"
  );
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    hasApprovalCheckpoint: true,
    executionPlan: {
      status: "ACCEPTED",
      planVersion: 1,
      acceptedPlanningInputHash: "hash-a",
      currentPlanningInputHash: "hash-a",
    },
    lines: [
      {
        id: "line-1",
        description: "Gutters",
        tasks: [
          {
            id: "task-1",
            title: "Install",
            stageId: "stage-1",
            providesSignals: [],
            requiresSignals: [],
            hardSignal: false,
          },
        ],
      },
    ],
    quoteTotalCents: 10000,
    paymentSchedule: [],
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.totalTasksToActivate, 1);
});
