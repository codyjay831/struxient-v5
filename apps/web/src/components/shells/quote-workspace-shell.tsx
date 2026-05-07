import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import {
  QuoteWorkspacePageClient,
  type QuoteWorkspacePageClientProps,
} from "@/components/quotes/quote-workspace-page-client";
import {
  formatMoneyCents,
  formatQuoteStatus,
  quoteStatusBadgeTone,
  type QuoteDetailPayload,
  type QuoteSendCheckpointSummary,
} from "@/lib/quote-display";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import { type QuoteReadiness } from "@/lib/quote-readiness";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type QuoteWorkspaceShellProps = {
  quote: QuoteDetailPayload;
  lineItemTemplates: LineItemTemplatePickerRow[];
  sendCheckpoints: QuoteSendCheckpointSummary[];
  approvalCheckpoints: QuoteSendCheckpointSummary[];
  /** Set when the approved quote has been activated into a runtime job. */
  activatedJobId: string | null;
  /** Pre-fetched draft execution tasks keyed by line item id (used by inline editor). */
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  /** Reusable task picker options for the org (empty when execution is not editable). */
  reusableTaskOptions: ReusableTaskPickerOption[];
  quoteReadiness: QuoteReadiness;
  /** Pre-built QuoteWorkSurface payload (same shape used by Workstation drawer + Lead embed). */
  quoteWorkSurface: QuoteWorkSurfaceData;
  /**
   * Optional return context link shown as the first header action when the user
   * arrived from Workstation.
   */
  returnHref?: string;
};

function QuoteDetailShell({
  quote,
  lineItemTemplates,
  sendCheckpoints,
  approvalCheckpoints,
  activatedJobId,
  draftTasksByLineId,
  reusableTaskOptions,
  quoteReadiness,
  quoteWorkSurface,
  returnHref,
}: QuoteWorkspaceShellProps) {
  const locale = "en-US";
  const dateOpts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const createdAtLabel = new Date(quote.createdAt).toLocaleDateString(locale, dateOpts);

  /* ── Identity: primary = lead title / customer name / quote title ── */
  const primaryIdentity =
    quote.lead?.title ?? quote.customer?.displayName ?? quote.title;
  const quoteSubtitle = quote.title !== primaryIdentity ? quote.title : null;

  const clientProps: QuoteWorkspacePageClientProps = {
    quote,
    lineItemTemplates,
    sendCheckpoints,
    approvalCheckpoints,
    activatedJobId,
    draftTasksByLineId,
    reusableTaskOptions,
    quoteReadiness,
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* ── Breadcrumb ──────────────────────────────────────────────────── */}
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          { label: primaryIdentity },
        ]}
      />

      {/* ── Identity header ──────────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <StatusBadge
              label={formatQuoteStatus(quote.status)}
              tone={quoteStatusBadgeTone(quote.status)}
            />
            <span className="text-xs text-foreground-subtle">
              Commercial quote · {createdAtLabel}
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">
            {primaryIdentity}
          </h1>
          {quoteSubtitle && (
            <p className="text-sm text-foreground-muted mt-0.5">Quote: {quoteSubtitle}</p>
          )}
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {formatMoneyCents(quote.totalCents)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {returnHref && (
            <Link href={returnHref} className={listLinkClass}>
              ← Workstation
            </Link>
          )}
          {quote.lead && (
            <Link href={`/leads/${quote.lead.id}`} className={listLinkClass}>
              ← Opportunity
            </Link>
          )}
          <Link href="/quotes" className={listLinkClass}>
            ← Quotes
          </Link>
        </div>
      </div>

      {/* ── Quote work surface — same UX as Workstation drawer + Lead embed ─ */}
      <QuoteWorkSurface
        mode="full"
        quote={quoteWorkSurface}
        readiness={quoteReadiness}
      />

      {/* ── Tabbed workspace client ────────────────────────────────────── */}
      <QuoteWorkspacePageClient {...clientProps} />
    </div>
  );
}

export function QuoteWorkspaceShell(props: QuoteWorkspaceShellProps) {
  return <QuoteDetailShell {...props} />;
}
