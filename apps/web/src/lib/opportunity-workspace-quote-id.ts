import {
  pickMostRecentDraftQuote,
  pickMostRecentNonArchivedQuote,
  type OpportunityFlowView,
} from "@/lib/opportunity-flow";

export type WorkspaceLinkedQuote = {
  id: string;
  title: string;
  status: string;
  totalCents: number;
  _count: { lineItems: number };
};

export function resolveWorkspaceQuoteId(
  flow: OpportunityFlowView,
  linkedQuotes: WorkspaceLinkedQuote[],
): string | null {
  const fromFlow =
    flow.primaryAction?.targetQuoteId ??
    flow.secondaryActions.find((action) => action.targetQuoteId)?.targetQuoteId ??
    null;
  if (fromFlow) return fromFlow;

  const quoteInputs = linkedQuotes
    .filter((quote) => quote.status !== "ARCHIVED")
    .map((quote) => ({
      id: quote.id,
      title: quote.title,
      status: quote.status as import("@prisma/client").QuoteStatus,
      totalCents: quote.totalCents,
      lineItemCount: quote._count.lineItems,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      job: null,
    }));

  return (
    pickMostRecentDraftQuote(quoteInputs)?.id ??
    pickMostRecentNonArchivedQuote(quoteInputs)?.id ??
    null
  );
}
