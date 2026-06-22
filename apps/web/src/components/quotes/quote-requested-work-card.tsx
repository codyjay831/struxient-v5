import Link from "next/link";
import { FileText } from "lucide-react";
import type { QuoteWorkspaceLead } from "@/lib/quote-workspace-payload";

export type QuoteRequestedWorkCardProps = {
  lead: Pick<QuoteWorkspaceLead, "scopeSummary" | "notes" | "href" | "title"> | null;
  /** When true, omit outer card chrome for embedding inside another panel. */
  embedded?: boolean;
};

/**
 * Read-only display of customer-stated requested work from the linked lead.
 * Source context only — quote line items remain the reviewed commercial truth.
 */
export function QuoteRequestedWorkCard({ lead, embedded = false }: QuoteRequestedWorkCardProps) {
  if (!lead) return null;

  const scopeSummary = lead.scopeSummary?.trim() || null;
  const hasIntakeNotes = Boolean(lead.notes?.trim());

  const wrapperClass = embedded
    ? "space-y-2"
    : "rounded-lg border border-border bg-surface p-4";

  return (
    <section className={wrapperClass} aria-label="Requested work">
      <div className="flex items-start gap-2">
        <FileText
          className="mt-0.5 size-4 shrink-0 text-foreground-subtle"
          strokeWidth={1.5}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
              Requested work
            </p>
            <Link
              href={lead.href}
              className="text-[0.65rem] font-medium text-accent underline-offset-2 hover:underline"
            >
              View opportunity
            </Link>
          </div>

          {scopeSummary ? (
            <>
              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                {scopeSummary}
              </p>
              <p className="text-xs text-foreground-muted">
                Customer-stated context from intake — not approved quote scope.
              </p>
            </>
          ) : hasIntakeNotes ? (
            <>
              <p className="text-sm text-foreground-muted">
                No scope summary on the linked opportunity. Use{" "}
                <span className="font-medium text-foreground">Customer &amp; Intake</span> for full
                intake context, or{" "}
                <span className="font-medium text-foreground">Quick scope capture</span> to draft
                line items.
              </p>
              <p className="text-xs text-foreground-subtle truncate" title={lead.title}>
                {lead.title}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground-muted">
                No requested-work summary on the linked opportunity yet.
              </p>
              <p className="text-xs text-foreground-subtle truncate" title={lead.title}>
                {lead.title}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
