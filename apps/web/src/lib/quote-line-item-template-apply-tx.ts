import "server-only";

import type { Prisma } from "@prisma/client";
import {
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
} from "@prisma/client";
import { EXECUTION_STAGE_KEYS_ORDERED } from "@/lib/execution-stage-catalog";
import { computeLineTotalCents } from "@/lib/quote-money";

export type QuoteRollupTx = Pick<Prisma.TransactionClient, "quoteLineItem" | "quote">;

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
  tx: Prisma.TransactionClient,
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
      executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED,
      executionMergeMode: QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES,
      executionOrder: nextOrder,
    },
  });

  const templateTasks = await tx.lineItemTemplateTask.findMany({
    where: { lineItemTemplateId: template.id },
  });
  const sortedTemplateTasks = [...templateTasks].sort((a, b) => {
    const ia = EXECUTION_STAGE_KEYS_ORDERED.indexOf(a.stageKey);
    const ib = EXECUTION_STAGE_KEYS_ORDERED.indexOf(b.stageKey);
    if (ia !== ib) {
      return ia - ib;
    }
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
        stageKey: tt.stageKey,
        category: tt.category,
        instructions: tt.instructions,
        sortOrder: tt.sortOrder,
      },
    });
  }

  await recalculateQuoteRollupsInTx(tx, { quoteId, organizationId });
  return { ok: true };
}
