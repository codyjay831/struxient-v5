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

/** Short staff-facing summary of which optional proposal fields are populated. */
function customerProposalFieldSummary(line: QuoteLineItemPayload): string {
  const parts: string[] = [];
  if (line.customerScopeTitle) {
    parts.push("display title");
  }
  if (line.customerScopeDescription) {
    parts.push("scope description");
  }
  if (line.customerIncludedNotes) {
    parts.push("included notes");
  }
  if (line.customerExcludedNotes) {
    parts.push("excluded notes");
  }
  if (line.customerPresentationGroup) {
    parts.push("presentation group");
  }
  return parts.join(" · ");
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
    <div className="min-w-0 flex-1 space-y-3">
      <div>
        <p className={lineMetricLabelClass}>Staff scope (internal description)</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{line.description}</p>
      </div>

      <dl className="grid gap-3 rounded-lg border border-border bg-foreground/[0.02] px-3 py-3 text-xs sm:grid-cols-3 sm:gap-4">
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

      <div className="rounded-md border border-border bg-surface/80 px-3 py-2">
        <p className={lineMetricLabelClass}>Customer proposal wording (optional)</p>
        {hasCustomerProposal ? (
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            <span className="font-medium text-foreground-subtle">Set: </span>
            {customerProposalFieldSummary(line)}. Shapes the internal proposal preview only.
          </p>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Not set on this line. Expand <span className="font-medium text-foreground-subtle">Edit</span> to add
            optional customer-facing title, scope text, notes, or a presentation group.
          </p>
        )}
      </div>

      {line.internalNotes ? (
        <p className="rounded-md border border-border bg-foreground/[0.02] px-3 py-2 text-xs leading-relaxed text-foreground-muted">
          <span className="font-medium text-foreground-subtle">Staff-only line notes: </span>
          {line.internalNotes}
        </p>
      ) : null}
    </div>
  );
}
