/**
 * Customer-facing preview: controlled projection only — never raw Prisma rows.
 * Intentionally excludes internalNotes, template ids, and org ids.
 */

export type QuoteCustomerPreviewLine = {
  id: string;
  sortOrder: number;
  /** Display-only grouping label; not workflow/stage/task. */
  presentationGroup: string | null;
  /** Resolved title shown on the proposal (customerScopeTitle ?? internal description). */
  lineTitle: string;
  /** Optional customer-facing scope detail; null when unset (no fallback to internal description). */
  lineDetail: string | null;
  includedNotes: string | null;
  excludedNotes: string | null;
  quantityDisplay: string;
  unitAmountCents: number;
  lineTotalCents: number;
};

/**
 * Input to {@link buildCustomerQuotePreviewDocument}: only fields safe to map into a customer preview.
 * Load with a Prisma `select` that omits `internalNotes` on the quote and on line items so staff-only text never enters this pipeline.
 */
export type QuoteCustomerPreviewInput = {
  id: string;
  title: string;
  customerDocumentTitle: string | null;
  customer: { displayName: string } | null;
  lead: { title: string } | null;
  lineItems: QuoteCustomerPreviewLineInput[];
  subtotalCents: number;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Server-selected commercial + customer-facing line fields (no internalNotes). */
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

function resolveLineTitle(input: QuoteCustomerPreviewLineInput): {
  lineTitle: string;
  usedInternalDescriptionForTitle: boolean;
} {
  const explicit = input.customerScopeTitle?.trim();
  if (explicit) {
    return { lineTitle: explicit, usedInternalDescriptionForTitle: false };
  }
  return {
    lineTitle: input.description,
    usedInternalDescriptionForTitle: true,
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

  return {
    document: {
      organizationDisplayName: context.organizationDisplayName,
      quoteId: quote.id,
      documentTitle,
      customer: quote.customer,
      lead: quote.lead,
      lineItems: mapped,
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
