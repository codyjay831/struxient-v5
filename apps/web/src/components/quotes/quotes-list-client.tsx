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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import type { QuoteStatus } from "@prisma/client";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import {
  loadQuoteWorkSurfaceAction,
  type LoadQuoteWorkSurfaceResult,
} from "@/app/(workspace)/quotes/quote-loader-actions";
import type { QuoteWorkSurfaceLoaderResult } from "@/lib/quote-work-surface-loader";

/* ─── Serialized list-row payload (computed in page.tsx server-side) ───── */

export type SerializedQuoteListRow = {
  id: string;
  /** Display title — lead title → customer name → quote title (same rule the surface uses). */
  primaryIdentity: string;
  /** Internal quote title when distinct from primary identity. */
  secondaryIdentity: string | null;
  /** "Customer · Company · Lead: Title · Contact" or "No customer or lead linked". */
  contextLine: string;
  /** Compact staleness, e.g. `Intake 2D 3H · Quote 6H` or `Quote 6H`. */
  ageLine: string;
  totalCents: number;
  /** Pre-formatted total for display. */
  totalLabel: string;
  status: QuoteStatus;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  /** Derived readiness label/tone (computed list-side with cheap inputs). */
  readinessLabel: string;
  readinessTone: StatusBadgeTone;
  /** Server-formatted timestamps (fixed locale — SSR/CSR consistent). */
  createdLabel: string;
  updatedLabel: string;
  /** Canonical full-page URL — escape hatch + middle-click fallback. */
  href: string;
};

/* ─── Lazy load state machine for the open quote ───────────────────────── */

type QuoteSurfaceLazyState =
  | { kind: "loading" }
  | { kind: "loaded"; payload: QuoteWorkSurfaceLoaderResult }
  | { kind: "error"; message: string };

/* ─── Compact loading / error UI (popup body) ──────────────────────────── */

function CompactLoading() {
  return (
    <div
      className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground-subtle"
      role="status"
      aria-live="polite"
    >
      Loading quote…
    </div>
  );
}

function CompactError({
  message,
  fallbackHref,
}: {
  message: string;
  fallbackHref: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-surface px-4 py-3"
      role="alert"
      aria-live="polite"
    >
      <p className="text-xs font-medium text-foreground">
        Couldn&apos;t load quote details.
      </p>
      <p className="mt-1 text-[0.7rem] text-foreground-subtle">{message}</p>
      <Link
        href={fallbackHref}
        className="mt-2 inline-flex items-center gap-1 text-xs text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
      >
        Open full quote page
        <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
      </Link>
    </div>
  );
}

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

/* ─── Popup chrome + lazy-loaded QuoteWorkSurface body ─────────────────── */

function QuotePopupContent({
  quote,
  onClose,
}: {
  quote: SerializedQuoteListRow;
  onClose: () => void;
}) {
  const [state, setState] = useState<QuoteSurfaceLazyState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadQuoteWorkSurfaceAction(quote.id)
      .then((res: LoadQuoteWorkSurfaceResult) => {
        if (cancelled) return;
        if (res.ok) {
          setState({ kind: "loaded", payload: res.payload });
        } else {
          setState({ kind: "error", message: res.error });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load quote — try opening the full quote page.";
        setState({ kind: "error", message });
      });

    return () => {
      cancelled = true;
    };
  }, [quote.id]);

  return (
    <div className="flex max-h-[88vh] flex-col">
      {/* ── Header (popup chrome — status, identity, context, close) ─── */}
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <StatusBadge label={quote.statusLabel} tone={quote.statusTone} />
            <StatusBadge
              label={quote.readinessLabel}
              tone={quote.readinessTone}
              className="text-[0.65rem] px-1.5 py-0.5"
            />
            <span className="text-xs text-foreground-subtle">
              Commercial quote · {quote.createdLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quote workspace"
            className="rounded-lg border border-border bg-surface p-1.5 text-foreground-subtle hover:text-foreground hover:bg-background transition-colors shrink-0"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-foreground tracking-tight leading-tight">
              {quote.primaryIdentity}
            </h2>
            {quote.secondaryIdentity ? (
              <p className="text-sm text-foreground-muted mt-0.5">
                Quote: {quote.secondaryIdentity}
              </p>
            ) : null}
            <p className="text-xs text-foreground-muted mt-0.5 break-words">
              {quote.contextLine}
            </p>
          </div>
          <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
            {quote.totalLabel}
          </p>
        </div>
      </div>

      {/* ── Body — lazy QuoteWorkSurface(standard) ─────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {state.kind === "loading" ? <CompactLoading /> : null}
        {state.kind === "error" ? (
          <CompactError message={state.message} fallbackHref={quote.href} />
        ) : null}
        {state.kind === "loaded" ? (
          <QuoteWorkSurface
            mode="standard"
            quote={state.payload.quote}
            readiness={state.payload.readiness}
            workspaceTabs={state.payload.workspaceTabs}
            suppressIdentityRow
          />
        ) : null}
      </div>
    </div>
  );
}

/* ─── Main export ──────────────────────────────────────────────────────── */

export function QuotesListClient({ quotes }: { quotes: SerializedQuoteListRow[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);

  const openQuote = quotes.find((q) => q.id === openQuoteId) ?? null;

  /* Sync native dialog open/close state */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openQuoteId && !dialog.open) {
      dialog.showModal();
    } else if (!openQuoteId && dialog.open) {
      dialog.close();
    }
  }, [openQuoteId]);

  /* Reset state when user presses Escape (native cancel) */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel() {
      setOpenQuoteId(null);
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  const openWorkspace = useCallback((id: string) => {
    setOpenQuoteId(id);
  }, []);

  const closeWorkspace = useCallback(() => {
    dialogRef.current?.close();
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

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWorkspace();
        }}
      >
        {openQuote ? (
          /* Key by quote.id so internal state (lazy fetch ref) resets cleanly
             when the user opens a different quote without closing first. */
          <QuotePopupContent
            key={openQuote.id}
            quote={openQuote}
            onClose={closeWorkspace}
          />
        ) : null}
      </dialog>
    </>
  );
}
