import { Prisma, QuoteStatus } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import {
  appendQuickScopeObservationsToQuoteInternalNotes,
  appendQuoteJobContextToQuoteInternalNotes,
  mapCommercialSuggestionToLineFields,
  mapOptionalAddOnToLineFields,
} from "@/lib/ai/quote-scope-suggestion-persist";
import type {
  ApprovedCommercialLineItem,
  OptionalAddOnSuggestion,
} from "@/lib/ai/quote-line-items-proposal-schema";
import {
  performApplyLineItemTemplateToQuoteTx,
  recalculateQuoteRollupsInTx,
} from "@/lib/quote-line-item-template-apply-tx";
import { computeLineTotalCents } from "@/lib/quote-money";

export class QuoteScopeApplyTxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteScopeApplyTxError";
  }
}

export type ApplyQuoteScopeSuggestionsTxInput = {
  quoteId: string;
  organizationId: string;
  selectedTemplateIds: string[];
  selectedCommercialLineItems: ApprovedCommercialLineItem[];
  selectedOptionalAddOns: OptionalAddOnSuggestion[];
  selectedQuoteJobContext: string[];
  /** Quote-wide hidden internal observations from Quick Scope draft review. */
  quoteMissingInfo: string[];
  /** Optional quote-level context summary to ground title sanitization. */
  sourceContextSummary?: string | null;
  createdByUserId?: string | null;
};

async function createCommercialLineRow(
  tx: ExtendedTransactionClient,
  quoteId: string,
  fields: ReturnType<typeof mapCommercialSuggestionToLineFields>,
): Promise<string> {
  const agg = await tx.quoteLineItem.aggregate({
    where: { quoteId },
    _max: { sortOrder: true },
  });
  const nextOrder = (agg._max.sortOrder ?? -1) + 1;
  const quantity = new Prisma.Decimal(1);
  const unitAmountCents = 0;
  const lineTotal = computeLineTotalCents(quantity, unitAmountCents);
  if (!lineTotal.ok) {
    throw new Error(lineTotal.error);
  }

  const created = await tx.quoteLineItem.create({
    data: {
      quoteId,
      sortOrder: nextOrder,
      description: fields.description,
      customerScopeTitle: fields.customerScopeTitle,
      customerScopeDescription: fields.customerScopeDescription,
      customerIncludedNotes: fields.customerIncludedNotes,
      customerExcludedNotes: null,
      customerPresentationGroup: null,
      quantity,
      unitAmountCents,
      lineTotalCents: lineTotal.lineTotalCents,
      internalNotes: fields.internalNotes,
      sourceLineItemTemplateId: null,
    },
    select: { id: true },
  });
  return created.id;
}

export async function performApplyQuoteScopeSuggestionsInTx(
  tx: ExtendedTransactionClient,
  input: ApplyQuoteScopeSuggestionsTxInput,
): Promise<{ ok: true; createdCount: number } | { ok: false; error: string }> {
  const quote = await tx.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId,
      status: QuoteStatus.DRAFT,
    },
    select: { id: true, internalNotes: true },
  });

  if (!quote) {
    return {
      ok: false,
      error:
        "This quote could not be updated. It may not be a draft, may be archived, or is outside your organization.",
    };
  }

  let createdCount = 0;

  for (const templateId of input.selectedTemplateIds) {
    const result = await performApplyLineItemTemplateToQuoteTx(
      tx,
      input.quoteId,
      templateId,
      input.organizationId,
      {
        sanitizeTitleForQuickScope: true,
        sourceGroundingText: input.sourceContextSummary,
      },
    );
    if (!result.ok) {
      throw new QuoteScopeApplyTxError(
        "One or more selected library items could not be applied.",
      );
    }
    createdCount += 1;
  }

  for (const item of input.selectedCommercialLineItems) {
    const fields = mapCommercialSuggestionToLineFields(item, {
      sourceGroundingText: input.sourceContextSummary,
    });
    try {
      await createCommercialLineRow(tx, input.quoteId, fields);
      createdCount += 1;
    } catch (e) {
      throw new QuoteScopeApplyTxError(
        e instanceof Error ? e.message : "Failed to create line items from scope suggestions.",
      );
    }
  }

  for (const addOn of input.selectedOptionalAddOns) {
    const fields = mapOptionalAddOnToLineFields(addOn);
    try {
      await createCommercialLineRow(tx, input.quoteId, fields);
      createdCount += 1;
    } catch (e) {
      throw new QuoteScopeApplyTxError(
        e instanceof Error ? e.message : "Failed to create line items from scope suggestions.",
      );
    }
  }

  const mergedJobContext = appendQuoteJobContextToQuoteInternalNotes(
    quote.internalNotes,
    input.selectedQuoteJobContext,
  );
  const mergedNotes = appendQuickScopeObservationsToQuoteInternalNotes(
    mergedJobContext,
    input.quoteMissingInfo,
  );
  if (mergedNotes !== (quote.internalNotes ?? null)) {
    await tx.quote.update({
      where: { id: input.quoteId },
      data: { internalNotes: mergedNotes },
    });
  }

  await recalculateQuoteRollupsInTx(tx, {
    quoteId: input.quoteId,
    organizationId: input.organizationId,
  });

  return { ok: true, createdCount };
}
