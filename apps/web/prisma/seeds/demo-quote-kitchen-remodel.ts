/**
 * Multi-trade "Kitchen Remodel Demo Quote" seed.
 *
 * Materializes a realistic draft quote by applying several trade line-item templates
 * from the Scope Library.
 */

import { QuoteStatus, type PrismaClient } from "@prisma/client";
import {
  materializeQuoteLinesFromTemplates,
  upsertQuoteShell,
} from "./seed-quote-materialization";

export const DEMO_QUOTE_ID = "dev-quote-kitchen-remodel";

const KITCHEN_REMODEL_LINES = [
  { templateId: "dev-trade-framing-interior-wall-framing", quantityOverride: "20" },
  { templateId: "dev-trade-electrical-kitchen-remodel-rough-in" },
  { templateId: "dev-trade-electrical-recessed-lighting-circuit", quantityOverride: "8" },
  { templateId: "dev-trade-plumbing-kitchen-sink-faucet-disposal" },
  { templateId: "dev-trade-hvac-duct-run-modification" },
  { templateId: "dev-trade-drywall-hang-tape-finish-l4", quantityOverride: "600" },
  { templateId: "dev-trade-painting-interior-repaint-2coat", quantityOverride: "1" },
] as const;

export async function seedKitchenRemodelDemoQuote(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    customerId: string;
    leadId: string;
  },
) {
  const { organizationId, customerId, leadId } = input;

  await upsertQuoteShell(prisma, {
    quoteId: DEMO_QUOTE_ID,
    organizationId,
    customerId,
    leadId,
    status: QuoteStatus.DRAFT,
    title: "Kitchen remodel — Martinez residence",
    customerDocumentTitle: "Proposal: Kitchen remodel & lighting upgrade",
    internalNotes:
      "[dev seed] Multi-trade draft linked to journey-lead-kitchen; materialized from Scope Library.",
  });

  const result = await materializeQuoteLinesFromTemplates(prisma, {
    quoteId: DEMO_QUOTE_ID,
    organizationId,
    lines: [...KITCHEN_REMODEL_LINES],
  });

  return {
    quoteId: DEMO_QUOTE_ID,
    lineCount: result.lineCount,
    totalCents: result.totalCents,
  };
}
