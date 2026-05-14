import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/ui/workspace-breadcrumb";
import { StatusBadge } from "@/components/ui/status-badge";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import { formatMoneyCents } from "@/lib/quote-display";
import type { QuoteReadiness } from "@/lib/quote-readiness";
import type { QuoteWorkSurfaceData } from "@/lib/quote-work-surface-data";
import type { QuoteWorkspaceTabData } from "@/lib/quote-workspace-payload";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type QuoteWorkspaceShellProps = {
  quote: QuoteWorkSurfaceData;
  readiness: QuoteReadiness;
  workspaceTabs: QuoteWorkspaceTabData;
  /** Optional return-context link shown when arrived from Workstation. */
  returnHref?: string;
};

/**
 * Full Quote page shell. Provides breadcrumb, identity header, and hosts a
 * single `<QuoteWorkSurface mode="full" />` — the same surface every other
 * container hosts. There is no separate full-page workspace body.
 */
export function QuoteWorkspaceShell({
  quote,
  readiness,
  workspaceTabs,
  returnHref,
}: QuoteWorkspaceShellProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <WorkspaceBreadcrumb
        items={[
          { label: "Sales" },
          { label: "Quotes", href: "/quotes" },
          { label: quote.primaryTitle },
        ]}
      />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge label={quote.statusLabel} tone={quote.statusTone} />
            <span className="text-xs text-foreground-subtle">
              Commercial quote
              {quote.createdAtLabel ? ` · ${quote.createdAtLabel}` : ""}
            </span>
          </div>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground">
            {quote.primaryTitle}
          </h1>
          {quote.subtitle ? (
            <p className="mt-0.5 text-sm text-foreground-muted">
              Quote: {quote.subtitle}
            </p>
          ) : null}
          <p className="mt-2 text-xl font-bold tabular-nums text-foreground">
            {formatMoneyCents(quote.totalCents)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {returnHref ? (
            <Link href={returnHref} className={listLinkClass}>
              ← Workstation
            </Link>
          ) : null}
          {quote.leadHref ? (
            <Link href={quote.leadHref} className={listLinkClass}>
              ← Lead
            </Link>
          ) : null}
          <Link href="/quotes" className={listLinkClass}>
            ← Quotes
          </Link>
        </div>
      </div>

      <QuoteWorkSurface
        mode="full"
        quote={quote}
        readiness={readiness}
        workspaceTabs={workspaceTabs}
      />
    </div>
  );
}
