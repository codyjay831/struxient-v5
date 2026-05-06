import { QuoteLiveProposalPreviewLineBlock } from "@/components/quotes/quote-line-item-display";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import type { QuoteCustomerPreviewDocument } from "@/lib/quote-customer-projection";
import { formatMoneyCents } from "@/lib/quote-display";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

type QuoteCheckpointRecordedBodyProps = {
  document: QuoteCustomerPreviewDocument;
  showTitleFallbackWarning: boolean;
};

/**
 * Renders a stored commercial proposal projection from a SEND or APPROVAL checkpoint payload (staff-only).
 * Must not be fed raw Prisma rows — only parsed {@link QuoteCustomerPreviewDocument}.
 */
export function QuoteCheckpointRecordedBody({
  document,
  showTitleFallbackWarning,
}: QuoteCheckpointRecordedBodyProps) {
  const createdLabel = new Date(document.createdAt).toLocaleString();
  const updatedLabel = new Date(document.updatedAt).toLocaleString();

  return (
    <div className="border-border-strong bg-surface shadow-sm ring-1 ring-border/60">
      <div className="border-b border-border px-4 pb-6 pt-6 sm:px-6">
        <p className={`${fieldLabelClass} text-foreground-subtle`}>{document.organizationDisplayName}</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{document.documentTitle}</h2>
        <p className="mt-2 break-all font-mono text-xs text-foreground-muted">Reference: {document.quoteId}</p>
      </div>

      {showTitleFallbackWarning ? (
        <div className="border-b border-border border-l-[3px] border-l-danger/60 bg-danger/[0.03] px-4 py-4 sm:px-6">
          <p className="text-sm font-medium text-foreground">Staff-only: proposal title fallback</p>
          <p className="mt-2 text-xs leading-relaxed text-foreground-muted">
            At least one line used internal line wording as the proposal line title at capture time because no proposal
            scope title was set.
          </p>
        </div>
      ) : null}

      {document.customer || document.lead ? (
        <div className="border-b border-border px-4 py-6 sm:px-6">
          <SectionHeading
            title="Prepared for"
            description="Display names as captured on the checkpoint — not live workspace links."
          />
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className={fieldLabelClass}>Customer</dt>
              <dd className="mt-1 text-sm text-foreground">{document.customer?.displayName ?? "—"}</dd>
            </div>
            <div>
              <dt className={fieldLabelClass}>Inquiry title</dt>
              <dd className="mt-1 text-sm text-foreground">{document.lead?.title ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="px-4 py-6 sm:px-6">
        <SectionHeading
          title="Scope"
          description="Sellable rows as captured — display-only grouping labels; not stages or tasks."
        />
        {document.lineItems.length === 0 ? (
          <p className="mt-4 text-sm text-foreground-muted">No line items were captured on this checkpoint.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
            {document.lineItems.map((line, index) => {
              const prev = document.lineItems[index - 1];
              const showGroupHeader =
                line.presentationGroup != null &&
                line.presentationGroup !== "" &&
                (!prev || prev.presentationGroup !== line.presentationGroup);
              return (
                <li key={line.id} className="px-4 py-4">
                  {showGroupHeader ? (
                    <p
                      className={`${fieldLabelClass} mb-3 border-b border-border pb-2 text-foreground`}
                    >
                      {line.presentationGroup}
                    </p>
                  ) : null}
                  <QuoteLiveProposalPreviewLineBlock line={line} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border px-4 pb-6 pt-6 sm:px-6">
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <SignalCard
            label="Subtotal"
            value={formatMoneyCents(document.subtotalCents)}
            hint="Stored totals from capture."
          />
          <SignalCard
            label="Total"
            value={formatMoneyCents(document.totalCents)}
            hint="Stored totals from capture."
          />
        </div>
        <dl className="grid gap-3 text-xs text-foreground-muted sm:grid-cols-2">
          <div>
            <dt className={fieldLabelClass}>Workspace record timestamps (at capture)</dt>
            <dd className="mt-0.5 text-foreground">{createdLabel}</dd>
          </div>
          <div>
            <dt className={fieldLabelClass}>Last workspace update (at capture)</dt>
            <dd className="mt-0.5 text-foreground">{updatedLabel}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
