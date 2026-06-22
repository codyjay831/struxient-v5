/**
 * Live proposal preview projection: controlled staff-only view — never raw Prisma rows.
 * Intentionally excludes internalNotes, template ids, and org ids.
 */

import { resolveNonFinalScheduleItemCents } from "@/lib/payment-schedule-materialization";

export type QuoteCustomerPreviewLine = {
  id: string;
  sortOrder: number;
  /** Display-only grouping label; not workflow/stage/task. */
  presentationGroup: string | null;
  /** Resolved title shown on the proposal (customerScopeTitle ?? internal description). */
  lineTitle: string;
  /** Optional proposal scope detail; null when unset (no fallback to internal description). */
  lineDetail: string | null;
  includedNotes: string | null;
  excludedNotes: string | null;
  quantityDisplay: string;
  unitAmountCents: number;
  lineTotalCents: number;
};

export type QuoteCustomerPreviewPaymentMilestone = {
  id: string;
  title: string;
  amountCents: number;
  anchorType: string;
  anchorStageName: string | null;
  sortOrder: number;
};

/**
 * Input to {@link buildCustomerQuotePreviewDocument}: only fields safe to map into live proposal preview / checkpoint payloads.
 * Load with a Prisma `select` that omits `internalNotes` on the quote and on line items so staff-only text never enters this pipeline.
 */
export type QuoteCustomerPreviewInput = {
  id: string;
  title: string;
  customerDocumentTitle: string | null;
  customer: { displayName: string } | null;
  lead: { title: string } | null;
  lineItems: QuoteCustomerPreviewLineInput[];
  paymentSchedule: QuoteCustomerPreviewPaymentMilestoneInput[];
  subtotalCents: number;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Server-selected commercial + optional proposal line fields (no internalNotes). */
export type QuoteCustomerPreviewLineInput = {
  id: string;
  sortOrder: number;
  description: string;
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
  customerPresentationGroup: string | null;
  quantityDisplay: string;
  unitAmountCents: number;
  lineTotalCents: number;
};

export type QuoteCustomerPreviewPaymentMilestoneInput = {
  id: string;
  title: string;
  amountCents: number | null;
  percentage: string | null;
  anchorType: string;
  anchorStageId: string | null;
  anchorStageName: string | null;
  sortOrder: number;
};

/**
 * Serializable document for internal “customer view” preview only.
 * Excludes internal ids on parties (names/titles only for a proposal-style header today).
 */
export type QuoteCustomerPreviewDocument = {
  organizationDisplayName: string;
  quoteId: string;
  /** Resolved proposal document title: customerDocumentTitle ?? title. */
  documentTitle: string;
  customer: { displayName: string } | null;
  lead: { title: string } | null;
  lineItems: QuoteCustomerPreviewLine[];
  paymentSchedule: QuoteCustomerPreviewPaymentMilestone[];
  subtotalCents: number;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Staff-only signals for the internal preview route (omit on any future customer channel). */
export type QuoteCustomerPreviewStaffSignals = {
  /** True when any line uses internal `description` as the proposal line title. */
  anyLineUsesInternalDescriptionForTitle: boolean;
};

export type BuildCustomerQuotePreviewContext = {
  organizationDisplayName: string;
};

export type QuoteCustomerPreviewBuildResult = {
  document: QuoteCustomerPreviewDocument;
  staffOnly: QuoteCustomerPreviewStaffSignals;
};

function normalizeGroup(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const t = value.trim();
  return t === "" ? null : t;
}

/** Resolves percentage and fixed milestones to cents for customer-facing views (matches job activation). */
export function buildCustomerPreviewPaymentSchedule(
  items: readonly QuoteCustomerPreviewPaymentMilestoneInput[],
  quoteTotalCents: number,
): QuoteCustomerPreviewPaymentMilestone[] {
  let resolvedNonFinalSum = 0;
  const resolvedNonFinalById = new Map<string, number>();

  for (const item of items) {
    if (item.anchorType === "FINAL_BALANCE") continue;

    const resolved = resolveNonFinalScheduleItemCents(
      {
        title: item.title,
        amountCents: item.amountCents,
        percentage: item.percentage,
      },
      quoteTotalCents,
    );
    const amountCents = resolved.ok ? resolved.amountCents : (item.amountCents ?? 0);
    resolvedNonFinalById.set(item.id, amountCents);
    resolvedNonFinalSum += amountCents;
  }

  const remainderCents = Math.max(0, quoteTotalCents - resolvedNonFinalSum);

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    amountCents:
      item.anchorType === "FINAL_BALANCE"
        ? remainderCents
        : (resolvedNonFinalById.get(item.id) ?? item.amountCents ?? 0),
    anchorType: item.anchorType,
    anchorStageName: item.anchorStageName,
    sortOrder: item.sortOrder,
  }));
}

function resolveLineTitle(input: QuoteCustomerPreviewLineInput): {
  lineTitle: string;
  usedInternalDescriptionForTitle: boolean;
} {
  const explicit = input.customerScopeTitle?.trim();
  if (explicit) {
    return { lineTitle: explicit, usedInternalDescriptionForTitle: false };
  }
  return {
    lineTitle: input.customerScopeTitle?.trim() || "Line Item",
    usedInternalDescriptionForTitle: !input.customerScopeTitle?.trim(),
  };
}

/**
 * Builds a customer-safe preview DTO. Totals and line money fields are taken as stored on the quote
 * (server-loaded truth)—never recomputed from untrusted input.
 */
export function buildCustomerQuotePreviewDocument(
  quote: QuoteCustomerPreviewInput,
  context: BuildCustomerQuotePreviewContext,
): QuoteCustomerPreviewBuildResult {
  const documentTitle =
    quote.customerDocumentTitle?.trim() && quote.customerDocumentTitle.trim().length > 0
      ? quote.customerDocumentTitle.trim()
      : quote.title;

  let anyLineUsesInternalDescriptionForTitle = false;

  const mapped: QuoteCustomerPreviewLine[] = quote.lineItems.map((line) => {
    const { lineTitle, usedInternalDescriptionForTitle } = resolveLineTitle(line);
    if (usedInternalDescriptionForTitle) {
      anyLineUsesInternalDescriptionForTitle = true;
    }
    const detailRaw = line.customerScopeDescription?.trim();
    const lineDetail = detailRaw && detailRaw.length > 0 ? detailRaw : null;
    const inc = line.customerIncludedNotes?.trim();
    const exc = line.customerExcludedNotes?.trim();

    return {
      id: line.id,
      sortOrder: line.sortOrder,
      presentationGroup: normalizeGroup(line.customerPresentationGroup),
      lineTitle,
      lineDetail,
      includedNotes: inc && inc.length > 0 ? inc : null,
      excludedNotes: exc && exc.length > 0 ? exc : null,
      quantityDisplay: line.quantityDisplay,
      unitAmountCents: line.unitAmountCents,
      lineTotalCents: line.lineTotalCents,
    };
  });

  const groupSortKey = (g: string | null) => (g ?? "").toLocaleLowerCase("en-US");
  mapped.sort((a, b) => {
    const ga = groupSortKey(a.presentationGroup);
    const gb = groupSortKey(b.presentationGroup);
    if (ga !== gb) {
      return ga.localeCompare(gb, "en-US");
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.id.localeCompare(b.id);
  });

  const paymentSchedule = buildCustomerPreviewPaymentSchedule(
    quote.paymentSchedule,
    quote.totalCents,
  );

  return {
    document: {
      organizationDisplayName: context.organizationDisplayName,
      quoteId: quote.id,
      documentTitle,
      customer: quote.customer,
      lead: quote.lead,
      lineItems: mapped,
      paymentSchedule,
      subtotalCents: quote.subtotalCents,
      totalCents: quote.totalCents,
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    },
    staffOnly: {
      anyLineUsesInternalDescriptionForTitle,
    },
  };
}
