import { QuoteScopeDecisionStatus, QuoteStatus, type Prisma } from "@prisma/client";
import type { ExtendedTransactionClient } from "../db";

export type QuoteSendReadinessInput = {
  status: QuoteStatus;
  lineItemCount: number;
  serviceLocationId: string | null;
  paymentScheduleItemCount: number;
  openScopeDecisionCount: number;
};

export type QuoteSendReadinessFailure = {
  ok: false;
  error: string;
};

export type QuoteSendReadinessSuccess = { ok: true };

export type QuoteSendReadinessResult = QuoteSendReadinessSuccess | QuoteSendReadinessFailure;

const quoteSendReadinessSelect = {
  status: true,
  serviceLocationId: true,
  _count: {
    select: {
      lineItems: true,
      paymentSchedule: true,
      scopeDecisions: true,
    },
  },
} satisfies Prisma.QuoteSelect;

type QuoteSendReadinessRow = Prisma.QuoteGetPayload<{ select: typeof quoteSendReadinessSelect }>;

function openScopeDecisionWhere(organizationId: string) {
  return {
    organizationId,
    status: QuoteScopeDecisionStatus.OPEN,
  };
}

export function evaluateQuoteSendReadiness(
  input: QuoteSendReadinessInput,
): QuoteSendReadinessResult {
  if (input.status !== QuoteStatus.DRAFT) {
    return {
      ok: false,
      error: "Only draft quotes can be sent. Refresh and try again.",
    };
  }
  if (input.lineItemCount === 0) {
    return { ok: false, error: "Add at least one scope line item before sending." };
  }
  if (!input.serviceLocationId) {
    return { ok: false, error: "Add a jobsite address before sending." };
  }
  if (input.paymentScheduleItemCount === 0) {
    return { ok: false, error: "Define payment terms before sending." };
  }
  if (input.openScopeDecisionCount > 0) {
    return {
      ok: false,
      error: `Resolve ${input.openScopeDecisionCount} open scope ${input.openScopeDecisionCount === 1 ? "decision" : "decisions"} before sending.`,
    };
  }
  return { ok: true };
}

function rowToInput(row: QuoteSendReadinessRow, openScopeDecisionCount: number): QuoteSendReadinessInput {
  return {
    status: row.status,
    lineItemCount: row._count.lineItems,
    serviceLocationId: row.serviceLocationId,
    paymentScheduleItemCount: row._count.paymentSchedule,
    openScopeDecisionCount,
  };
}

export async function assertQuoteReadyToSendInTx(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
): Promise<QuoteSendReadinessResult> {
  const row = await tx.quote.findFirst({
    where: { id: quoteId, organizationId },
    select: quoteSendReadinessSelect,
  });
  if (!row) {
    return { ok: false, error: "Quote not found in your organization." };
  }

  const openScopeDecisionCount = await tx.quoteScopeDecision.count({
    where: {
      quoteId,
      ...openScopeDecisionWhere(organizationId),
    },
  });

  return evaluateQuoteSendReadiness(rowToInput(row, openScopeDecisionCount));
}
