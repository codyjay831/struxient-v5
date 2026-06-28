/**
 * Shared quote line + execution task materialization from Scope Library templates.
 */

import { Prisma } from "@prisma/client";

export type QuoteLineTemplateConfig = {
  templateId: string;
  quantityOverride?: string;
};

export type MaterializeQuoteLinesResult = {
  lineCount: number;
  totalCents: number;
};

type MaterializedLineItemTemplate = Prisma.LineItemTemplateGetPayload<{
  include: { defaultExecutionTasks: true };
}>;

export type QuoteMaterializationDb = {
  quoteLineItem: {
    deleteMany(args: Prisma.QuoteLineItemDeleteManyArgs): Promise<unknown>;
    create(args: Prisma.QuoteLineItemCreateArgs): Promise<unknown>;
  };
  lineItemTemplate: {
    findUnique(args: Prisma.LineItemTemplateFindUniqueArgs): Promise<unknown>;
  };
  quoteLineExecutionTask: {
    createMany(args: Prisma.QuoteLineExecutionTaskCreateManyArgs): Promise<unknown>;
  };
  quote: {
    update(args: Prisma.QuoteUpdateArgs): Promise<unknown>;
    upsert(args: Prisma.QuoteUpsertArgs): Promise<unknown>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMaterializedLineItemTemplate(
  value: unknown,
): value is MaterializedLineItemTemplate {
  return isRecord(value) && Array.isArray(value.defaultExecutionTasks);
}

function getCreatedQuoteLineId(value: unknown): string {
  if (isRecord(value) && typeof value.id === "string") {
    return value.id;
  }
  throw new Error("Failed to create quote line item.");
}

export async function materializeQuoteLinesFromTemplates(
  prisma: QuoteMaterializationDb,
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
    const templateResult = await prisma.lineItemTemplate.findUnique({
      where: { id: config.templateId, organizationId },
      include: { defaultExecutionTasks: true },
    });

    if (!isMaterializedLineItemTemplate(templateResult)) {
      console.warn(`[seed] missing template: ${config.templateId}`);
      continue;
    }
    const template = templateResult;

    const quantity = new Prisma.Decimal(config.quantityOverride ?? template.defaultQuantity);
    const lineTotalCents = quantity
      .mul(new Prisma.Decimal(template.defaultUnitAmountCents))
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();

    runningSubtotalCents += lineTotalCents;

    const createdLineId = getCreatedQuoteLineId(await prisma.quoteLineItem.create({
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
    }));

    if (template.defaultExecutionTasks.length > 0) {
      await prisma.quoteLineExecutionTask.createMany({
        data: template.defaultExecutionTasks.map((tt) => ({
          quoteLineItemId: createdLineId,
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
  prisma: QuoteMaterializationDb,
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
