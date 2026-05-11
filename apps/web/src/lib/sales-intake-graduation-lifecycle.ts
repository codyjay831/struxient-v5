import type { StatusBadgeTone } from "@/components/ui/status-badge";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type { QuoteReadiness } from "@/lib/quote-readiness";
import type { QuoteWorkspaceTabData } from "@/lib/quote-workspace-payload";

export type SalesIntakeGraduationActiveQuotePayload = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
};

export type SerializedSalesIntakeQuoteSummary = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

export type SerializedSalesIntakeRowSnapshot = {
  id: string;
  quotes: SerializedSalesIntakeQuoteSummary[];
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: {
    href: string;
    label: string;
    opensQuoteTab: boolean;
    opensContactTab: boolean;
  } | null;
  progressSecondaryAction: {
    href: string;
    label: string;
    opensQuoteTab: boolean;
    opensContactTab: boolean;
  } | null;
  valueLabel?: string | null;
};

/** Reset post-create / graduation client state only when the open sales intake id changes. */
export function shouldResetSalesIntakeWorkspaceState(
  previousId: string | null,
  nextId: string,
): boolean {
  return previousId !== null && previousId !== nextId;
}

/** Keep the open intake workspace snapshot aligned after a quote is created in-place. */
export function patchSerializedSalesIntakeRowAfterQuoteStarted<
  T extends SerializedSalesIntakeRowSnapshot,
>(
  row: T,
  args: {
    quoteId: string;
    activeQuotePayload: SalesIntakeGraduationActiveQuotePayload | null;
  },
): T {
  const quote = args.activeQuotePayload?.quote;
  if (!quote) return row;

  const quoteSummary: SerializedSalesIntakeQuoteSummary = {
    id: quote.id,
    title: quote.title,
    statusLabel: quote.statusLabel,
    statusTone: quote.statusTone,
    totalCents: quote.totalCents,
    lineItemCount: quote.lineItemCount,
    href: quote.quoteHref,
  };

  const quotes = [
    quoteSummary,
    ...row.quotes.filter((existing) => existing.id !== quoteSummary.id),
  ];

  return {
    ...row,
    quotes,
    progressLabel: "Quote in progress",
    progressDescription: "A draft quote is open.",
    progressTone: "draft",
    progressState: "QUOTE_IN_PROGRESS",
    progressPrimaryAction: {
      href: quote.quoteHref,
      label: "Open draft quote",
      opensQuoteTab: true,
      opensContactTab: false,
    },
    progressSecondaryAction: null,
    valueLabel: quote.totalCents > 0 ? formatUsd(quote.totalCents) : row.valueLabel ?? null,
  };
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
