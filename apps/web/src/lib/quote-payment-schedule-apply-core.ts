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
  expectedExistingSchedule: boolean;
  milestones: NormalizedPaymentScheduleMilestone[];
};

export type ApplyQuotePaymentScheduleTxResult =
  | { ok: true; createdCount: number; leadId: string | null }
  | { ok: false; error: string };

export const QUOTE_PAYMENT_SCHEDULE_CHANGED_ERROR =
  "Payment schedule changed. Refresh and review the current schedule before applying AI suggestions.";

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
): Promise<ApplyQuotePaymentScheduleTxResult> {
  await tx.$queryRaw`
    SELECT "id"
    FROM "Quote"
    WHERE "id" = ${input.quoteId}
    FOR UPDATE
  `;

  const quote = await tx.quote.findFirst({
    where: {
      id: input.quoteId,
      organizationId: input.organizationId,
      status: QuoteStatus.DRAFT,
      job: { is: null },
    },
    select: {
      id: true,
      leadId: true,
      paymentSchedule: { select: { id: true } },
    },
  });

  if (!quote) {
    return { ok: false, error: "Quote not found or not a draft." };
  }

  const currentHasSchedule = quote.paymentSchedule.length > 0;
  if (currentHasSchedule !== input.expectedExistingSchedule) {
    return { ok: false, error: QUOTE_PAYMENT_SCHEDULE_CHANGED_ERROR };
  }

  if (input.expectedExistingSchedule) {
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

  return { ok: true, createdCount, leadId: quote.leadId };
}
