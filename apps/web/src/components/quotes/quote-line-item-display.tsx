import type { QuoteCustomerPreviewLine } from "@/lib/quote-customer-projection";
import type { QuoteLineItemPayload } from "@/lib/quote-display";
import { formatMoneyCents } from "@/lib/quote-display";

const lineMetricLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

function lineHasCustomerProposalSurface(line: QuoteLineItemPayload): boolean {
  return Boolean(
    line.customerScopeTitle ||
      line.customerScopeDescription ||
      line.customerIncludedNotes ||
      line.customerExcludedNotes ||
      line.customerPresentationGroup,
  );
}

/**
 * Read-only line body for internal customer preview — same numeric layout as {@link QuoteLineItemScanBlock}
 * without internal notes (DTO never carries staff-only fields).
 */
export function QuoteCustomerPreviewLineBlock({ line }: { line: QuoteCustomerPreviewLine }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">{line.lineTitle}</p>
      {line.lineDetail ? (
        <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{line.lineDetail}</p>
      ) : null}
      {line.includedNotes ? (
        <div className="mt-3 rounded-md border border-border bg-foreground/[0.02] px-3 py-2">
          <p className={lineMetricLabelClass}>Included</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground">{line.includedNotes}</p>
        </div>
      ) : null}
      {line.excludedNotes ? (
        <div className="mt-2 rounded-md border border-border bg-foreground/[0.02] px-3 py-2">
          <p className={lineMetricLabelClass}>Excluded</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">{line.excludedNotes}</p>
        </div>
      ) : null}
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3 sm:gap-4">
        <div>
          <dt className={lineMetricLabelClass}>Quantity</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{line.quantityDisplay}</dd>
        </div>
        <div>
          <dt className={lineMetricLabelClass}>Unit price</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">
            {formatMoneyCents(line.unitAmountCents)}
          </dd>
        </div>
        <div>
          <dt className={lineMetricLabelClass}>Line total</dt>
          <dd className="mt-0.5 tabular-nums font-medium text-foreground">
            {formatMoneyCents(line.lineTotalCents)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Read-only line body: internal description plus qty / unit / line total for scanning.
 * Used on draft (summary row) and archived quote detail.
 */
export function QuoteLineItemScanBlock({ line }: { line: QuoteLineItemPayload }) {
  const hasCustomerProposal = lineHasCustomerProposalSurface(line);
  return (
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-foreground">{line.description}</p>
      {hasCustomerProposal ? (
        <p className="mt-1 text-[0.65rem] text-foreground-subtle">
          Customer proposal text is set for this line—see preview.
        </p>
      ) : null}
      <dl className="mt-2 grid gap-3 text-xs sm:grid-cols-3 sm:gap-4">
        <div>
          <dt className={lineMetricLabelClass}>Quantity</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">{line.quantityDisplay}</dd>
        </div>
        <div>
          <dt className={lineMetricLabelClass}>Unit price</dt>
          <dd className="mt-0.5 tabular-nums text-foreground">
            {formatMoneyCents(line.unitAmountCents)}
          </dd>
        </div>
        <div>
          <dt className={lineMetricLabelClass}>Line total</dt>
          <dd className="mt-0.5 tabular-nums font-medium text-foreground">
            {formatMoneyCents(line.lineTotalCents)}
          </dd>
        </div>
      </dl>
      {line.internalNotes ? (
        <p className="mt-3 rounded-md border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground-subtle">Internal: </span>
          {line.internalNotes}
        </p>
      ) : null}
    </div>
  );
}
