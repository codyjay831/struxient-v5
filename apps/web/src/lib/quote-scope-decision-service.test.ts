import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScopeDecisionDuplicateKey,
  createQuoteScopeDecisionIfAbsent,
  createQuoteScopeDecisionsFromMissingInfoStrings,
  normalizeScopeDecisionText,
} from "@/lib/quote-scope-decision-core";
import type { QuoteScopeDecisionTx } from "@/lib/quote-scope-decision-core";

type MockDecision = {
  id: string;
  organizationId: string;
  quoteId: string;
  quoteLineItemId: string | null;
  sourceType: "QUICK_SCOPE";
  title: string;
  detail: string | null;
  status: "OPEN" | "DEFERRED" | "RESOLVED" | "DISMISSED";
};

function createMockDecisionTx(initial: MockDecision[] = []): QuoteScopeDecisionTx {
  const rows = [...initial];
  let idCounter = initial.length + 1;

  return {
    quoteScopeDecision: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        return rows.filter((row) => {
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
          if (where.sourceType && row.sourceType !== where.sourceType) {
            return false;
          }
          const statusFilter = where.status as { in?: string[] } | undefined;
          if (statusFilter?.in && !statusFilter.in.includes(row.status)) {
            return false;
          }
          return true;
        });
      },
      create: async ({ data }: { data: Omit<MockDecision, "id"> }) => {
        const created: MockDecision = {
          id: `decision-${idCounter++}`,
          organizationId: data.organizationId,
          quoteId: data.quoteId,
          quoteLineItemId: data.quoteLineItemId ?? null,
          sourceType: data.sourceType,
          title: data.title,
          detail: data.detail ?? null,
          status: "OPEN",
        };
        rows.push(created);
        return { id: created.id };
      },
    },
  } as unknown as QuoteScopeDecisionTx;
}

test("normalizeScopeDecisionText collapses whitespace and lowercases", () => {
  assert.equal(normalizeScopeDecisionText("  Confirm   Color  "), "confirm color");
});

test("buildScopeDecisionDuplicateKey uses normalized title and detail", () => {
  assert.equal(
    buildScopeDecisionDuplicateKey("Confirm Color", null),
    "confirm color|",
  );
  assert.equal(
    buildScopeDecisionDuplicateKey("Confirm Color", "  Main  house "),
    "confirm color|main house",
  );
});

test("createQuoteScopeDecisionIfAbsent skips active duplicate by normalized title", async () => {
  const tx = createMockDecisionTx([
    {
      id: "existing-1",
      organizationId: "org-1",
      quoteId: "quote-1",
      quoteLineItemId: "line-1",
      sourceType: "QUICK_SCOPE",
      title: "Confirm gutter color",
      detail: null,
      status: "OPEN",
    },
  ]);

  const first = await createQuoteScopeDecisionIfAbsent(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: "line-1",
    sourceType: "QUICK_SCOPE",
    title: "  CONFIRM   gutter   color ",
    detail: null,
  });
  assert.equal(first.created, false);
  assert.equal(first.id, "existing-1");

  const second = await createQuoteScopeDecisionIfAbsent(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: "line-1",
    sourceType: "QUICK_SCOPE",
    title: "Measure fascia length",
    detail: null,
  });
  assert.equal(second.created, true);
});

test("createQuoteScopeDecisionsFromMissingInfoStrings creates quote-wide decisions", async () => {
  const tx = createMockDecisionTx();
  const result = await createQuoteScopeDecisionsFromMissingInfoStrings(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: null,
    missingInfo: ["Confirm access gate code", "Verify roof pitch"],
  });

  assert.equal(result.createdCount, 2);
  assert.equal(result.skippedDuplicateCount, 0);

  const duplicate = await createQuoteScopeDecisionsFromMissingInfoStrings(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: null,
    missingInfo: ["confirm access gate code"],
  });
  assert.equal(duplicate.createdCount, 0);
  assert.equal(duplicate.skippedDuplicateCount, 1);
});

test("line-level decisions are scoped separately from quote-wide duplicates", async () => {
  const tx = createMockDecisionTx();
  await createQuoteScopeDecisionsFromMissingInfoStrings(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: null,
    missingInfo: ["Confirm color"],
  });
  const lineResult = await createQuoteScopeDecisionsFromMissingInfoStrings(tx, {
    organizationId: "org-1",
    quoteId: "quote-1",
    quoteLineItemId: "line-1",
    missingInfo: ["Confirm color"],
  });
  assert.equal(lineResult.createdCount, 1);
});
