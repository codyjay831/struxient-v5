import "server-only";

import { QuoteStatus } from "@prisma/client";
import { computeLineTotalCents } from "@/lib/quote-money";
import type { ExtendedTransactionClient } from "@/lib/db";

export type QuoteRollupTx = Pick<ExtendedTransactionClient, "quoteLineItem" | "quote">;

export async function recalculateQuoteRollupsInTx(
  tx: QuoteRollupTx,
  params: { quoteId: string; organizationId: string },
) {
  const { quoteId, organizationId } = params;
  const lines = await tx.quoteLineItem.findMany({
    where: { quoteId },
    select: { lineTotalCents: true },
  });
  const subtotal = lines.reduce((sum, row) => sum + row.lineTotalCents, 0);
  await tx.quote.updateMany({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.DRAFT,
    },
    data: {
      subtotalCents: subtotal,
      totalCents: subtotal,
    },
  });
}

/**
 * Apply a saved line-item template to a draft quote inside an existing transaction.
 * Shared by workspace quote actions and public instant-quote intake.
 */
export async function performApplyLineItemTemplateToQuoteTx(
  tx: ExtendedTransactionClient,
  quoteId: string,
  templateId: string,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; message: string | null }> {
  const template = await tx.lineItemTemplate.findFirst({
    where: {
      id: templateId,
      organizationId,
      archivedAt: null,
    },
  });
  if (!template) {
    return { ok: false, message: null };
  }

  const quote = await tx.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.DRAFT,
    },
    select: { id: true },
  });
  if (!quote) {
    return { ok: false, message: null };
  }

  const lineTotal = computeLineTotalCents(template.defaultQuantity, template.defaultUnitAmountCents);
  if (!lineTotal.ok) {
    return { ok: false, message: lineTotal.error };
  }

  const agg = await tx.quoteLineItem.aggregate({
    where: { quoteId },
    _max: { sortOrder: true },
  });
  const nextOrder = (agg._max.sortOrder ?? -1) + 1;

  const createdLine = await tx.quoteLineItem.create({
    data: {
      quoteId,
      sortOrder: nextOrder,
      description: template.description,
      customerScopeTitle: template.defaultCustomerScopeTitle,
      customerScopeDescription: template.defaultCustomerScopeDescription,
      customerIncludedNotes: template.defaultCustomerIncludedNotes,
      customerExcludedNotes: template.defaultCustomerExcludedNotes,
      customerPresentationGroup: template.defaultCustomerPresentationGroup,
      quantity: template.defaultQuantity,
      unitAmountCents: template.defaultUnitAmountCents,
      lineTotalCents: lineTotal.lineTotalCents,
      internalNotes: template.defaultInternalNotes,
      sourceLineItemTemplateId: template.id,
    },
  });

  const templateTasks = await tx.lineItemTemplateTask.findMany({
    where: { lineItemTemplateId: template.id },
    include: { stage: { select: { sortOrder: true } } },
  });
  const sortedTemplateTasks = [...templateTasks].sort((a, b) => {
    const sa = a.stage?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.stage?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.sortOrder - b.sortOrder;
  });
  for (const tt of sortedTemplateTasks) {
    await tx.quoteLineExecutionTask.create({
      data: {
        quoteLineItemId: createdLine.id,
        sourceLineItemTemplateTaskId: tt.id,
        sourceTaskTemplateId: tt.sourceTaskTemplateId,
        sourceType: tt.sourceType,
        title: tt.title,
        stageId: tt.stageId,
        category: tt.category,
        instructions: tt.instructions,
        sortOrder: tt.sortOrder,
        requirementsJson: tt.requirementsJson ?? {},
        providesSignals: tt.providesSignals ?? [],
        requiresSignals: tt.requiresSignals ?? [],
        hardSignal: tt.hardSignal ?? false,
      },
    });
  }

  await recalculateQuoteRollupsInTx(tx, { quoteId, organizationId });
  return { ok: true };
}
