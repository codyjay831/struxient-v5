"use client";

/**
 * QuotesListClient — Quotes page list rows + native `<dialog>` popup that
 * hosts `<QuoteWorkSurface mode="standard" />`.
 *
 * Mirrors `LeadsListClient`:
 *   - row click opens the popup (no hard navigation to /quotes/[id])
 *   - native `<dialog>` chrome with click-outside + Escape close
 *   - popup body re-keys on the open quote so internal state resets when the
 *     user opens a different row
 *
 * The QuoteWorkSurface payload is lazy-loaded via
 * `loadQuoteWorkSurfaceAction(quoteId)` the first time a row is opened — the
 * Quotes server query stays slim (no per-row activation/checkpoint queries).
 */

import { useCallback, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CenteredWorkspaceDialog } from "@/components/ui/centered-workspace-dialog";
import {
  QuoteWorkspaceDialogBody,
  quoteDisplayFromListRow,
  type SerializedQuoteListRow,
} from "@/components/work-surfaces/quote-workspace-dialog-body";

export type { SerializedQuoteListRow };

/* ─── Compact list row (popup-opening button) ──────────────────────────── */

function QuoteRow({
  quote,
  active,
  onOpen,
}: {
  quote: SerializedQuoteListRow;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full text-left px-4 py-4 transition-colors",
        active ? "bg-background" : "hover:bg-background/60",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground leading-snug">
              {quote.primaryIdentity}
            </span>
            {quote.secondaryIdentity ? (
              <span className="text-[10px] font-medium uppercase tracking-tight text-foreground-subtle">
                Quote title: {quote.secondaryIdentity}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-foreground-muted break-words">
            {quote.contextLine}
          </p>
          <p className="mt-2 text-xs text-foreground-subtle">
            {quote.ageLine}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge label={quote.statusLabel} tone={quote.statusTone} />
            <StatusBadge
              label={quote.readinessLabel}
              tone={quote.readinessTone}
              className="text-[0.65rem] px-1.5 py-0.5"
            />
          </div>
          <span className="text-sm font-medium tabular-nums text-foreground">
            {quote.totalLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground-subtle hover:border-border-strong hover:text-foreground transition-colors">
            Open
            <ArrowUpRight className="w-3 h-3 ml-0.5" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Main export ──────────────────────────────────────────────────────── */

export function QuotesListClient({ quotes }: { quotes: SerializedQuoteListRow[] }) {
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);

  const openQuote = quotes.find((q) => q.id === openQuoteId) ?? null;

  const openWorkspace = useCallback((id: string) => {
    setOpenQuoteId(id);
  }, []);

  const closeWorkspace = useCallback(() => {
    setOpenQuoteId(null);
  }, []);

  return (
    <>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {quotes.map((quote) => (
          <li key={quote.id}>
            <QuoteRow
              quote={quote}
              active={quote.id === openQuoteId}
              onOpen={() => openWorkspace(quote.id)}
            />
          </li>
        ))}
      </ul>

      <CenteredWorkspaceDialog open={openQuote != null} onClose={closeWorkspace}>
        {openQuote ? (
          <QuoteWorkspaceDialogBody
            key={openQuote.id}
            display={quoteDisplayFromListRow(openQuote)}
            onClose={closeWorkspace}
          />
        ) : null}
      </CenteredWorkspaceDialog>
    </>
  );
}
