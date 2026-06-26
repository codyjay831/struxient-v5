import type { ClarificationAnswer } from "@/lib/clarification/clarification-types";
import { findScopeDecisionIdsToCloseFromClarification } from "@/lib/quote/quote-gap-closure";

type ResolutionTx = {
  quoteScopeDecision: {
    findMany: (args: {
      where: {
        organizationId: string;
        quoteId: string;
        status: "OPEN";
        OR: Array<{ quoteLineItemId: string } | { quoteLineItemId: null }>;
      };
      select: {
        id: true;
        quoteLineItemId: true;
        title: true;
        detail: true;
        sourceRefType: true;
        sourceRefId: true;
      };
    }) => Promise<
      Array<{
        id: string;
        quoteLineItemId: string | null;
        title: string;
        detail: string | null;
        sourceRefType: string | null;
        sourceRefId: string | null;
      }>
    >;
    updateMany: (args: {
      where: {
        organizationId: string;
        quoteId: string;
        id: { in: string[] };
        status: "OPEN";
      };
      data: {
        status: "RESOLVED";
        resolutionTiming: null;
        resolvedAt: Date;
        resolvedByUserId: string | null;
        resolvedByClarificationId: string;
      };
    }) => Promise<{ count: number }>;
  };
};

export async function resolveMatchingScopeDecisionsForClarificationApply(
  tx: ResolutionTx,
  params: {
    organizationId: string;
    quoteId: string;
    lineId: string;
    questionSetKey: string;
    answers: readonly ClarificationAnswer[];
    clarificationId: string;
    resolvedByUserId: string | null;
  },
): Promise<{ resolvedGapCount: number; resolvedDecisionIds: string[] }> {
  const openScopeDecisions = await tx.quoteScopeDecision.findMany({
    where: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      status: "OPEN",
      OR: [{ quoteLineItemId: params.lineId }, { quoteLineItemId: null }],
    },
    select: {
      id: true,
      quoteLineItemId: true,
      title: true,
      detail: true,
      sourceRefType: true,
      sourceRefId: true,
    },
  });

  const matchingDecisionIds = findScopeDecisionIdsToCloseFromClarification({
    lineId: params.lineId,
    questionSetKey: params.questionSetKey,
    answers: params.answers,
    decisions: openScopeDecisions,
  });

  if (matchingDecisionIds.length === 0) {
    return { resolvedGapCount: 0, resolvedDecisionIds: [] };
  }

  const now = new Date();
  const updated = await tx.quoteScopeDecision.updateMany({
    where: {
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      id: { in: matchingDecisionIds },
      status: "OPEN",
    },
    data: {
      status: "RESOLVED",
      resolutionTiming: null,
      resolvedAt: now,
      resolvedByUserId: params.resolvedByUserId,
      resolvedByClarificationId: params.clarificationId,
    },
  });

  return {
    resolvedGapCount: updated.count,
    resolvedDecisionIds: matchingDecisionIds,
  };
}
