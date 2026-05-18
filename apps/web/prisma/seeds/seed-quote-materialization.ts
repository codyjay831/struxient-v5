/**
 * Shared quote line + execution task materialization from Scope Library templates.
 */

import { Prisma, type PrismaClient } from "@prisma/client";

export type QuoteLineTemplateConfig = {
  templateId: string;
  quantityOverride?: string;
};

export type MaterializeQuoteLinesResult = {
  lineCount: number;
  totalCents: number;
};

export async function materializeQuoteLinesFromTemplates(
  prisma: PrismaClient,
  input: {
    quoteId: string;
    organizationId: string;
    lines: QuoteLineTemplateConfig[];
  },
): Promise<MaterializeQuoteLinesResult> {
  const { quoteId, organizationId, lines } = input;

  await prisma.quoteLineItem.deleteMany({ where: { quoteId } });

  let runningSubtotalCents = 0;
  let materializedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const config = lines[i];
    const template = await prisma.lineItemTemplate.findUnique({
      where: { id: config.templateId, organizationId },
      include: { defaultExecutionTasks: true },
    });

    if (!template) {
      console.warn(`[seed] missing template: ${config.templateId}`);
      continue;
    }

    const quantity = new Prisma.Decimal(config.quantityOverride ?? template.defaultQuantity);
    const lineTotalCents = quantity
      .mul(new Prisma.Decimal(template.defaultUnitAmountCents))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();

    runningSubtotalCents += lineTotalCents;

    const createdLine = await prisma.quoteLineItem.create({
      data: {
        quoteId,
        sortOrder: i,
        description: template.description,
        customerScopeTitle: template.defaultCustomerScopeTitle,
        customerScopeDescription: template.defaultCustomerScopeDescription,
        customerIncludedNotes: template.defaultCustomerIncludedNotes,
        customerExcludedNotes: template.defaultCustomerExcludedNotes,
        customerPresentationGroup: template.defaultCustomerPresentationGroup,
        quantity,
        unitAmountCents: template.defaultUnitAmountCents,
        lineTotalCents,
        internalNotes: template.defaultInternalNotes,
        sourceLineItemTemplateId: template.id,
      },
    });

    if (template.defaultExecutionTasks.length > 0) {
      await prisma.quoteLineExecutionTask.createMany({
        data: template.defaultExecutionTasks.map((tt) => ({
          quoteLineItemId: createdLine.id,
          sourceLineItemTemplateTaskId: tt.id,
          sourceTaskTemplateId: tt.sourceTaskTemplateId,
          sourceType: tt.sourceType,
          title: tt.title,
          stageId: tt.stageId,
          category: tt.category,
          instructions: tt.instructions,
          providesSignals: tt.providesSignals,
          requiresSignals: tt.requiresSignals,
          hardSignal: tt.hardSignal,
          sortOrder: tt.sortOrder,
        })),
      });
    }

    materializedCount += 1;
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: { subtotalCents: runningSubtotalCents, totalCents: runningSubtotalCents },
  });

  return { lineCount: materializedCount, totalCents: runningSubtotalCents };
}

export async function upsertQuoteShell(
  prisma: PrismaClient,
  input: {
    quoteId: string;
    organizationId: string;
    customerId: string | null;
    leadId: string | null;
    title: string;
    customerDocumentTitle: string;
    internalNotes: string;
    status?: import("@prisma/client").QuoteStatus;
    lastSentEmailAt?: Date | null;
  },
) {
  const { quoteId, status, lastSentEmailAt, ...rest } = input;
  const statusFields = {
    ...(status !== undefined ? { status } : {}),
    ...(lastSentEmailAt !== undefined ? { lastSentEmailAt } : {}),
  };

  await prisma.quote.upsert({
    where: { id: quoteId },
    update: { ...rest, ...statusFields },
    create: { id: quoteId, ...rest, ...statusFields },
  });
}
