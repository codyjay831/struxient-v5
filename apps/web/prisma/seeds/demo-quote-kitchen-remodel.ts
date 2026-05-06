/**
 * Multi-trade "Kitchen Remodel Demo Quote" seed.
 *
 * Materializes a realistic draft quote by applying several trade line-item templates
 * from the Scope Library.
 *
 * Requirements:
 *  - Uses existing [LineItemTemplate] rows (ids starting `dev-trade-`).
 *  - Materializes default execution tasks from templates into the quote.
 *  - Idempotent: deletes existing lines/tasks for this specific quote before recreating.
 */

import {
  Prisma,
  QuoteStatus,
  QuoteLineExecutionReviewStatus,
  QuoteLineExecutionMergeMode,
  type PrismaClient,
} from "@prisma/client";

const DEMO_QUOTE_ID = "dev-quote-kitchen-remodel";

type DemoLineConfig = {
  templateId: string;
  quantityOverride?: string;
};

const KITCHEN_REMODEL_LINES: DemoLineConfig[] = [
  { templateId: "dev-trade-framing-interior-non-loadbearing-wall", quantityOverride: "15" },
  { templateId: "dev-trade-electrical-kitchen-remodel-rough-in" },
  { templateId: "dev-trade-electrical-recessed-lighting-circuit", quantityOverride: "8" },
  { templateId: "dev-trade-plumbing-kitchen-sink-faucet-disposal" },
  { templateId: "dev-trade-hvac-duct-run-modification" },
  { templateId: "dev-trade-drywall-hang-and-finish", quantityOverride: "600" },
  { templateId: "dev-trade-painting-interior-room-repaint", quantityOverride: "1" },
];

export async function seedKitchenRemodelDemoQuote(
  prisma: PrismaClient,
  organizationId: string,
  customerId: string,
) {
  // 1. Upsert the quote shell
  await prisma.quote.upsert({
    where: { id: DEMO_QUOTE_ID },
    update: {
      organizationId,
      customerId,
      status: QuoteStatus.DRAFT,
      title: "Kitchen Remodel — Demo Project",
      customerDocumentTitle: "Proposal: Kitchen Remodel & Lighting Upgrade",
      internalNotes:
        "[dev seed] Multi-trade demo quote materializing scope from the trade library.",
    },
    create: {
      id: DEMO_QUOTE_ID,
      organizationId,
      customerId,
      status: QuoteStatus.DRAFT,
      title: "Kitchen Remodel — Demo Project",
      customerDocumentTitle: "Proposal: Kitchen Remodel & Lighting Upgrade",
      internalNotes:
        "[dev seed] Multi-trade demo quote materializing scope from the trade library.",
    },
  });

  // 2. Clean existing lines (cascades to tasks)
  await prisma.quoteLineItem.deleteMany({
    where: { quoteId: DEMO_QUOTE_ID },
  });

  let runningSubtotalCents = 0;

  // 3. Materialize lines and tasks from templates
  for (let i = 0; i < KITCHEN_REMODEL_LINES.length; i++) {
    const config = KITCHEN_REMODEL_LINES[i];
    const template = await prisma.lineItemTemplate.findUnique({
      where: { id: config.templateId, organizationId },
      include: { defaultExecutionTasks: true },
    });

    if (!template) {
      console.warn(`[demo quote seed] Skipping missing template: ${config.templateId}`);
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
        quoteId: DEMO_QUOTE_ID,
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
        executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED,
        executionMergeMode: QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES,
        executionOrder: i,
      },
    });

    // Materialize tasks
    if (template.defaultExecutionTasks.length > 0) {
      await prisma.quoteLineExecutionTask.createMany({
        data: template.defaultExecutionTasks.map((tt) => ({
          quoteLineItemId: createdLine.id,
          sourceLineItemTemplateTaskId: tt.id,
          sourceTaskTemplateId: tt.sourceTaskTemplateId,
          sourceType: tt.sourceType,
          title: tt.title,
          stageKey: tt.stageKey,
          category: tt.category,
          instructions: tt.instructions,
          sortOrder: tt.sortOrder,
        })),
      });
    }
  }

  // 4. Update quote totals
  await prisma.quote.update({
    where: { id: DEMO_QUOTE_ID },
    data: {
      subtotalCents: runningSubtotalCents,
      totalCents: runningSubtotalCents,
    },
  });

  return {
    quoteId: DEMO_QUOTE_ID,
    lineCount: KITCHEN_REMODEL_LINES.length,
    totalCents: runningSubtotalCents,
  };
}
