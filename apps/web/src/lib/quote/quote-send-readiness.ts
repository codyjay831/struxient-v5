import { QuoteStatus, type Prisma } from "@prisma/client";
import type { ExtendedTransactionClient } from "../db";
import {
  buildQuoteSendBlockers,
  primaryQuoteSendBlockerMessage,
  type QuoteSendBlockerScopeDecision,
} from "./quote-send-blockers";

export type QuoteSendReadinessInput = {
  status: QuoteStatus;
  lineItemCount: number;
  serviceLocationId: string | null;
  paymentScheduleItemCount: number;
  scopeDecisions?: readonly QuoteSendBlockerScopeDecision[];
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
    },
  },
} satisfies Prisma.QuoteSelect;

const scopeDecisionSendSelect = {
  id: true,
  quoteLineItemId: true,
  status: true,
  quoteImpact: true,
  resolutionTiming: true,
  title: true,
} satisfies Prisma.QuoteScopeDecisionSelect;

type QuoteSendReadinessRow = Prisma.QuoteGetPayload<{ select: typeof quoteSendReadinessSelect }>;

export function evaluateQuoteSendReadiness(
  input: QuoteSendReadinessInput,
): QuoteSendReadinessResult {
  const result = buildQuoteSendBlockers(input);
  if (result.canSend) {
    return { ok: true };
  }

  const error = primaryQuoteSendBlockerMessage(result);
  return {
    ok: false,
    error: error ?? "This quote is not ready to send.",
  };
}

function rowToInput(
  row: QuoteSendReadinessRow,
  scopeDecisions: readonly QuoteSendBlockerScopeDecision[],
): QuoteSendReadinessInput {
  return {
    status: row.status,
    lineItemCount: row._count.lineItems,
    serviceLocationId: row.serviceLocationId,
    paymentScheduleItemCount: row._count.paymentSchedule,
    scopeDecisions,
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

  const scopeDecisions = await tx.quoteScopeDecision.findMany({
    where: {
      quoteId,
      organizationId,
    },
    select: scopeDecisionSendSelect,
  });

  return evaluateQuoteSendReadiness(rowToInput(row, scopeDecisions));
}

/** Exposed for workflow/UI alignment with server send gate. */
export function evaluateQuoteSendBlockers(input: QuoteSendReadinessInput) {
  return buildQuoteSendBlockers(input);
}
