"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import { QuoteWorkSurface } from "@/components/work-surfaces/quote-work-surface";
import {
  loadQuoteWorkSurfaceAction,
  type LoadQuoteWorkSurfaceResult,
} from "@/app/(workspace)/quotes/quote-loader-actions";
import type { QuoteWorkSurfaceLoaderResult } from "@/lib/quote-work-surface-loader";
import type { QuoteStatus } from "@prisma/client";

export type SerializedQuoteListRow = {
  id: string;
  primaryIdentity: string;
  secondaryIdentity: string | null;
  contextLine: string;
  ageLine: string;
  totalCents: number;
  totalLabel: string;
  status: QuoteStatus;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  readinessLabel: string;
  readinessTone: StatusBadgeTone;
  createdLabel: string;
  updatedLabel: string;
  href: string;
};

export type QuoteDialogDisplay = {
  quoteId: string;
  primaryIdentity: string;
  secondaryIdentity: string | null;
  contextLine: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  readinessLabel: string;
  readinessTone: StatusBadgeTone;
  createdLabel: string;
  totalLabel: string;
  href: string;
};

type QuoteSurfaceLazyState =
  | { kind: "loading" }
  | { kind: "loaded"; payload: QuoteWorkSurfaceLoaderResult }
  | { kind: "error"; message: string };

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

export function quoteDisplayFromListRow(
  quote: SerializedQuoteListRow,
): QuoteDialogDisplay {
  return {
    quoteId: quote.id,
    primaryIdentity: quote.primaryIdentity,
    secondaryIdentity: quote.secondaryIdentity,
    contextLine: quote.contextLine,
    statusLabel: quote.statusLabel,
    statusTone: quote.statusTone,
    readinessLabel: quote.readinessLabel,
    readinessTone: quote.readinessTone,
    createdLabel: quote.createdLabel,
    totalLabel: quote.totalLabel,
    href: quote.href,
  };
}

export type QuoteWorkspaceDialogBodyProps = {
  display: QuoteDialogDisplay;
  onClose: () => void;
};

function resolveDialogSubtitle(display: QuoteDialogDisplay): string | null {
  const context = display.contextLine?.trim();
  const secondary = display.secondaryIdentity?.trim();
  if (context) return context;
  if (secondary) return `Quote: ${secondary}`;
  return null;
}

export function QuoteWorkspaceDialogBody({
  display,
  onClose,
}: QuoteWorkspaceDialogBodyProps) {
  const [state, setState] = useState<QuoteSurfaceLazyState>({ kind: "loading" });
  const requestSeqRef = useRef(0);

  const loadSurface = useCallback(async () => {
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    await loadQuoteWorkSurfaceAction(display.quoteId)
      .then((res: LoadQuoteWorkSurfaceResult) => {
        if (requestSeqRef.current !== seq) return;
        if (res.ok) {
          setState({ kind: "loaded", payload: res.payload });
        } else {
          setState({ kind: "error", message: res.error });
        }
      })
      .catch((err: unknown) => {
        if (requestSeqRef.current !== seq) return;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load quote — try opening the full quote page.";
        setState({ kind: "error", message });
      });
  }, [display.quoteId]);

  useEffect(() => {
    void loadSurface();
  }, [loadSurface]);

  const handleWorkSurfaceMutated = useCallback(() => {
    setState({ kind: "loading" });
    void loadSurface();
  }, [loadSurface]);

  const subtitle = resolveDialogSubtitle(display);

  return (
    <div className="flex max-h-[88vh] flex-col">
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge label={display.statusLabel} tone={display.statusTone} />
            <StatusBadge
              label={display.readinessLabel}
              tone={display.readinessTone}
              className="px-1.5 py-0.5 text-[0.65rem]"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quote workspace"
            className="shrink-0 rounded-lg border border-border bg-surface p-1.5 text-foreground-subtle transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-tight tracking-tight text-foreground">
              {display.primaryIdentity}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 break-words text-sm text-foreground-muted">
                {subtitle}
              </p>
            ) : null}
          </div>
          <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
            {display.totalLabel}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {state.kind === "loading" ? <CompactLoading /> : null}
        {state.kind === "error" ? (
          <CompactError message={state.message} fallbackHref={display.href} />
        ) : null}
        {state.kind === "loaded" ? (
          <QuoteWorkSurface
            quote={state.payload.quote}
            readiness={state.payload.readiness}
            workspaceTabs={state.payload.workspaceTabs}
            suppressIdentityRow
            onWorkSurfaceMutated={handleWorkSurfaceMutated}
          />
        ) : null}
      </div>
    </div>
  );
}
