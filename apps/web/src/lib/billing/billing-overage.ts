import { AiBillingPeriodInvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatUsdFromCents } from "./billing-config";
import { getStripeClient } from "./billing-stripe";

export type OverageBillingResult = {
  processed: number;
  invoiced: number;
  skipped: number;
  failed: number;
  details: Array<{ periodId: string; organizationId: string; outcome: string }>;
};

/**
 * Closes ended AI billing periods and creates Stripe invoice items for overage.
 * Idempotent: periods with INVOICE_ITEM_CREATED or NO_OVERAGE are skipped.
 */
export async function billAiOveragesForEndedPeriods(params?: {
  asOf?: Date;
  organizationId?: string;
}): Promise<OverageBillingResult> {
  const asOf = params?.asOf ?? new Date();
  const result: OverageBillingResult = {
    processed: 0,
    invoiced: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  const periods = await db.aiBillingPeriod.findMany({
    where: {
      ...(params?.organizationId ? { organizationId: params.organizationId } : {}),
      periodEnd: { lte: asOf },
      invoiceStatus: AiBillingPeriodInvoiceStatus.OPEN,
    },
    include: {
      organization: {
        select: {
          billingAccount: { select: { stripeCustomerId: true } },
          name: true,
        },
      },
    },
    orderBy: { periodEnd: "asc" },
    take: 100,
  });

  const stripe = getStripeClient();

  for (const period of periods) {
    result.processed += 1;

    if (period.overageUnits <= 0 || period.overageAmountCents <= 0) {
      await db.aiBillingPeriod.update({
        where: { id: period.id },
        data: {
          invoiceStatus: AiBillingPeriodInvoiceStatus.NO_OVERAGE,
          closedAt: asOf,
        },
      });
      result.skipped += 1;
      result.details.push({
        periodId: period.id,
        organizationId: period.organizationId,
        outcome: "no_overage",
      });
      continue;
    }

    const customerId = period.organization.billingAccount?.stripeCustomerId;
    if (!customerId) {
      await db.aiBillingPeriod.update({
        where: { id: period.id },
        data: {
          invoiceStatus: AiBillingPeriodInvoiceStatus.FAILED,
          invoiceError: "Missing Stripe customer.",
          closedAt: asOf,
        },
      });
      result.failed += 1;
      result.details.push({
        periodId: period.id,
        organizationId: period.organizationId,
        outcome: "missing_customer",
      });
      continue;
    }

    try {
      const invoiceItem = await stripe.invoiceItems.create(
        {
          customer: customerId,
          amount: period.overageAmountCents,
          currency: "usd",
          description: `Struxient AI overage (${period.overageUnits} units, ${formatUsdFromCents(period.overageAmountCents)})`,
          metadata: {
            organizationId: period.organizationId,
            aiBillingPeriodId: period.id,
            overageUnits: String(period.overageUnits),
          },
        },
        {
          idempotencyKey: `ai-overage-${period.id}`,
        },
      );

      await db.aiBillingPeriod.update({
        where: { id: period.id },
        data: {
          invoiceStatus: AiBillingPeriodInvoiceStatus.INVOICE_ITEM_CREATED,
          stripeInvoiceItemId: invoiceItem.id,
          closedAt: asOf,
          invoiceError: null,
        },
      });

      result.invoiced += 1;
      result.details.push({
        periodId: period.id,
        organizationId: period.organizationId,
        outcome: "invoice_item_created",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown billing error";
      await db.aiBillingPeriod.update({
        where: { id: period.id },
        data: {
          invoiceStatus: AiBillingPeriodInvoiceStatus.FAILED,
          invoiceError: message,
          closedAt: asOf,
        },
      });
      result.failed += 1;
      result.details.push({
        periodId: period.id,
        organizationId: period.organizationId,
        outcome: "failed",
      });
    }
  }

  return result;
}
