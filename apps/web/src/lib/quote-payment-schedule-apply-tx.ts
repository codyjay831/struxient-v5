import "server-only";

import { PaymentScheduleAnchorType, Prisma, QuoteStatus } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import type { NormalizedPaymentScheduleMilestone } from "@/lib/ai/quote-payment-schedule-ai-plan";

export class QuotePaymentScheduleApplyTxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotePaymentScheduleApplyTxError";
  }
}

export type ApplyQuotePaymentScheduleTxInput = {
  quoteId: string;
  organizationId: string;
  replaceExisting: boolean;
  milestones: NormalizedPaymentScheduleMilestone[];
};

function parsePercentageForDb(
  value: string | null | undefined,
): Prisma.Decimal | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/%$/, "");
  if (!trimmed) return null;
  try {
    const d = new Prisma.Decimal(trimmed);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export async function performApplyQuotePaymentScheduleInTx(
  tx: ExtendedTransactionClient,
  input: ApplyQuotePaymentScheduleTxInput,
): Promise<{ ok: true; createdCount: number } | { ok: false; error: string }> {
  const quote = await tx.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId,
      status: QuoteStatus.DRAFT,
    },
    select: { id: true },
  });

  if (!quote) {
    return { ok: false, error: "Quote not found or not a draft." };
  }

  if (input.replaceExisting) {
    await tx.paymentScheduleItem.deleteMany({ where: { quoteId: input.quoteId } });
  }

  let createdCount = 0;
  for (const milestone of input.milestones) {
    await tx.paymentScheduleItem.create({
      data: {
        quoteId: input.quoteId,
        title: milestone.title,
        amountCents:
          milestone.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE
            ? null
            : milestone.amountCents,
        percentage:
          milestone.anchorType === PaymentScheduleAnchorType.FINAL_BALANCE
            ? null
            : parsePercentageForDb(milestone.percentage),
        anchorType: milestone.anchorType,
        anchorStageId: milestone.anchorStageId,
        sortOrder: milestone.sortOrder,
      },
    });
    createdCount += 1;
  }

  return { ok: true, createdCount };
}
