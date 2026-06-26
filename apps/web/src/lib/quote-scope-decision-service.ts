import "server-only";
import { QuoteScopeDecisionSourceType } from "@prisma/client";

export {
  applyQuoteScopeDecisionManualAction,
  createQuoteScopeDecisionIfAbsent,
  createQuoteScopeDecisionsFromMissingInfoStrings,
  type CreateQuoteScopeDecisionInput,
  type QuoteScopeDecisionTx,
} from "@/lib/quote-scope-decision-core";

import { formatScopeDecisionForAiContext } from "@/lib/quote-scope-decision-display";
import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";
import type { QuoteScopeDecisionTx } from "@/lib/quote-scope-decision-core";

function toPayload(row: {
  id: string;
  quoteId: string;
  quoteLineItemId: string | null;
  sourceType: QuoteScopeDecisionPayload["sourceType"];
  title: string;
  detail: string | null;
  status: QuoteScopeDecisionPayload["status"];
  resolutionTiming: QuoteScopeDecisionPayload["resolutionTiming"];
  quoteImpact: QuoteScopeDecisionPayload["quoteImpact"];
}): QuoteScopeDecisionPayload {
  return {
    id: row.id,
    quoteId: row.quoteId,
    quoteLineItemId: row.quoteLineItemId,
    sourceType: row.sourceType,
    title: row.title,
    detail: row.detail,
    status: row.status,
    resolutionTiming: row.resolutionTiming,
    quoteImpact: row.quoteImpact,
  };
}

export async function listQuoteScopeDecisionsForQuote(
  tx: QuoteScopeDecisionTx,
  params: {
    organizationId: string;
    quoteId: string;
    includeInactive?: boolean;
  },
): Promise<QuoteScopeDecisionPayload[]> {
  const rows = await tx.quoteScopeDecision.findMany({
    where: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      sourceType: { not: QuoteScopeDecisionSourceType.QUICK_SCOPE },
      ...(params.includeInactive
        ? {}
        : {
            status: {
              in: ["OPEN", "DEFERRED"],
            },
          }),
    },
    orderBy: [{ quoteLineItemId: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      quoteId: true,
      quoteLineItemId: true,
      sourceType: true,
      title: true,
      detail: true,
      status: true,
      resolutionTiming: true,
      quoteImpact: true,
    },
  });
  return rows.map(toPayload);
}

/**
 * Unresolved scope decision titles for Clarify Scope AI context.
 * Includes line-level decisions plus quote-wide gaps that may apply to the line.
 */
export async function listScopeDecisionContextStringsForLine(
  tx: QuoteScopeDecisionTx,
  params: {
    organizationId: string;
    quoteId: string;
    lineId: string;
  },
): Promise<string[]> {
  const rows = await tx.quoteScopeDecision.findMany({
    where: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      sourceType: { not: QuoteScopeDecisionSourceType.QUICK_SCOPE },
      status: { in: ["OPEN", "DEFERRED"] },
      OR: [{ quoteLineItemId: params.lineId }, { quoteLineItemId: null }],
    },
    orderBy: [{ quoteLineItemId: "asc" }, { createdAt: "asc" }],
    select: { title: true, detail: true },
  });

  const formatted = rows
    .map((row) => formatScopeDecisionForAiContext(row))
    .filter((value) => value.length > 0);

  return [...new Set(formatted)];
}
