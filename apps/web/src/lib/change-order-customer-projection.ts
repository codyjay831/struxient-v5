import {
  ChangeOrderLineOperation,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import type { ChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";
import { paymentImpactToCustomerTerms } from "@/lib/change-order/payment-impact-resolver";

export type ChangeOrderPreviewLine = {
  id: string;
  operation: ChangeOrderLineOperation;
  description: string;
  quantityDisplay: string;
  unitPriceCents: number;
  lineTotalCents: number;
  sourceDescription: string | null;
};

export type ChangeOrderPreviewScheduleLine = {
  id: string;
  title: string;
  amountCents: number;
  anchorType: PaymentScheduleAnchorType;
  anchorStageName: string | null;
};

export type ChangeOrderCustomerPreviewDocument = {
  organizationDisplayName: string;
  documentTitle: string;
  quoteTitle: string;
  changeOrderNumberLabel: string;
  changeOrderTitle: string;
  reasoning: string;
  lineItems: ChangeOrderPreviewLine[];
  paymentSchedule: ChangeOrderPreviewScheduleLine[];
  baseTotalCents: number;
  deltaCents: number;
  revisedTotalCents: number;
  updatedAt: string;
  paymentTerms: ChangeOrderCustomerPaymentTerms | null;
};

export type ChangeOrderCustomerPaymentTerms = {
  customerSummary: string;
  customerTermsText: string;
  strategyLabel: string;
  dueTimingLabel: string | null;
  affectedPaymentTitle: string | null;
  targetAmountBeforeCents: number | null;
  targetAmountAfterCents: number | null;
  isCredit: boolean;
  dueBeforeAddedWork: boolean;
};

export type BuildChangeOrderCustomerPreviewInput = {
  quoteTitle: string;
  quoteTotalCents: number;
  updatedAt: Date;
  changeOrderNumber: number;
  changeOrderTitle: string;
  customerDocumentTitle: string | null;
  reasoning: string;
  lines: Array<{
    id: string;
    operation: ChangeOrderLineOperation;
    description: string;
    quantity: string;
    unitPriceCents: number | null;
    priceDeltaCents: number | null;
    sourceJobScopeItem?: {
      description: string;
      quantity: string;
      unitPriceCents: number | null;
    } | null;
  }>;
  paymentSchedule: Array<{
    id: string;
    title: string;
    amountCents: number | null;
    anchorType: PaymentScheduleAnchorType;
    anchorStageName: string | null;
  }>;
  paymentImpact?: ChangeOrderPaymentImpact | null;
};

function formatNumberLabel(number: number): string {
  return `CO-${String(number).padStart(3, "0")}`;
}

function parseQuantity(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function computeLineTotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

function resolveLineAmount(line: BuildChangeOrderCustomerPreviewInput["lines"][number]): {
  quantityDisplay: string;
  unitPriceCents: number;
  lineTotalCents: number;
} {
  const quantity = parseQuantity(line.quantity);
  const quantityDisplay = String(quantity);
  if (line.operation === ChangeOrderLineOperation.REMOVE) {
    const unit = line.sourceJobScopeItem?.unitPriceCents ?? line.unitPriceCents ?? 0;
    return { quantityDisplay, unitPriceCents: unit, lineTotalCents: 0 };
  }
  const unit = line.unitPriceCents ?? line.sourceJobScopeItem?.unitPriceCents ?? 0;
  return {
    quantityDisplay,
    unitPriceCents: unit,
    lineTotalCents: computeLineTotalCents(quantity, unit),
  };
}

export function buildCustomerChangeOrderDocument(
  input: BuildChangeOrderCustomerPreviewInput,
  options: { organizationDisplayName: string },
): { document: ChangeOrderCustomerPreviewDocument } {
  const numberLabel = formatNumberLabel(input.changeOrderNumber);
  const lineItems: ChangeOrderPreviewLine[] = input.lines.map((line) => {
    const amount = resolveLineAmount(line);
    return {
      id: line.id,
      operation: line.operation,
      description: line.description,
      quantityDisplay: amount.quantityDisplay,
      unitPriceCents: amount.unitPriceCents,
      lineTotalCents: amount.lineTotalCents,
      sourceDescription: line.sourceJobScopeItem?.description ?? null,
    };
  });

  const deltaCents = input.lines.reduce((sum, line) => sum + (line.priceDeltaCents ?? 0), 0);
  const revisedTotalCents = input.quoteTotalCents + deltaCents;

  const paymentSchedule: ChangeOrderPreviewScheduleLine[] = input.paymentSchedule.map((line) => ({
    id: line.id,
    title: line.title,
    amountCents: line.amountCents ?? 0,
    anchorType: line.anchorType,
    anchorStageName: line.anchorStageName,
  }));

  const paymentTerms = input.paymentImpact
    ? paymentImpactToCustomerTerms(input.paymentImpact)
    : null;

  return {
    document: {
      organizationDisplayName: options.organizationDisplayName,
      documentTitle: input.customerDocumentTitle?.trim() || input.changeOrderTitle,
      quoteTitle: input.quoteTitle,
      changeOrderNumberLabel: numberLabel,
      changeOrderTitle: input.changeOrderTitle,
      reasoning: input.reasoning,
      lineItems,
      paymentSchedule,
      baseTotalCents: input.quoteTotalCents,
      deltaCents,
      revisedTotalCents,
      updatedAt: input.updatedAt.toISOString(),
      paymentTerms,
    },
  };
}
