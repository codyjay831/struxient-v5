import "server-only";

import { QuoteStatus } from "@prisma/client";
import { computeLineTotalCents } from "@/lib/quote-money";
import type { ExtendedTransactionClient } from "@/lib/db";
import { sanitizeQuickScopeLineTitle } from "@/lib/ai/quick-scope-title-guardrails";

export type QuoteRollupTx = Pick<ExtendedTransactionClient, "quoteLineItem" | "quote">;

export type QuotePlanTx = Pick<
  ExtendedTransactionClient,
  "quoteExecutionPlan" | "quoteExecutionTask" | "quoteExecutionTaskScope"
>;

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

export async function ensureQuoteExecutionPlanInTx(
  tx: QuotePlanTx,
  params: { quoteId: string; organizationId: string },
) {
  const { quoteId, organizationId } = params;
  return tx.quoteExecutionPlan.upsert({
    where: { quoteId },
    create: {
      quoteId,
      organizationId,
      status: "DRAFT",
      planVersion: 1,
      planningInputSchemaVersion: 1,
    },
    update: {},
    select: { id: true, planVersion: true, status: true },
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
  options?: { sanitizeTitleForQuickScope?: boolean; sourceGroundingText?: string | null },
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

  const description = options?.sanitizeTitleForQuickScope
    ? sanitizeQuickScopeLineTitle(template.description, {
        groundingText: options.sourceGroundingText,
      })
    : template.description;
  const customerScopeTitle = options?.sanitizeTitleForQuickScope
    ? template.defaultCustomerScopeTitle
      ? sanitizeQuickScopeLineTitle(template.defaultCustomerScopeTitle, {
          groundingText: options.sourceGroundingText,
        })
      : null
    : template.defaultCustomerScopeTitle;

  const createdLine = await tx.quoteLineItem.create({
    data: {
      quoteId,
      sortOrder: nextOrder,
      description,
      customerScopeTitle,
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

  // Whole-quote planning owns execution task creation now; applying a line template
  // only creates commercial scope rows.

  await recalculateQuoteRollupsInTx(tx, { quoteId, organizationId });
  return { ok: true };
}
