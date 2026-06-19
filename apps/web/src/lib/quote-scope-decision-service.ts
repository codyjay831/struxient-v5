import "server-only";

export {
  applyQuoteScopeDecisionManualAction,
  createQuoteScopeDecisionIfAbsent,
  createQuoteScopeDecisionsFromMissingInfoStrings,
  type CreateQuoteScopeDecisionInput,
  type QuoteScopeDecisionTx,
} from "@/lib/quote-scope-decision-core";

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
