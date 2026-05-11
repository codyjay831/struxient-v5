"use client";

/**
 * SalesIntakesListClient — client component for the real Sales Intakes page.
 *
 * The popup body is rendered by `SalesIntakeWorkSurface` (mode="standard"). This file
 * owns the list rows + native dialog chrome and adapts the serialized list-row
 * payload into the unified Work Surface props. Graduating an intake off the
 * intake queue must not unmount an open workspace dialog.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Inbox, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  SalesIntakeWorkSurface,
  type SalesIntakeWorkSurfaceActiveQuotePayload,
  type SalesIntakeWorkSurfaceData,
  type SalesIntakeWorkSurfaceProgressAction,
  type SalesIntakeWorkSurfaceQuote,
} from "@/components/work-surfaces/sales-intake-work-surface";
import { patchSerializedSalesIntakeRowAfterQuoteStarted } from "@/lib/sales-intake-graduation-lifecycle";
import {
  loadSalesIntakeActiveQuoteWorkSurfaceAction,
  loadSalesIntakeServiceAddressContextAction,
} from "@/app/(workspace)/sales/sales-workspace-actions";

/* ─── Serialized types (computed server-side, passed as plain props) ─────── */

export type SerializedProgressAction = SalesIntakeWorkSurfaceProgressAction;

export type SerializedQuoteSummary = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

import type { SalesIntakeSource } from "@prisma/client";

export type SerializedSalesIntakeRow = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: SalesIntakeSource;
  sourceLabel: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  /** Server-rendered staleness hint, e.g. `Age 2D 3H`. */
  ageLabel: string;
  /** Optional value hint, e.g. `$1,200`. */
  valueLabel?: string | null;
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: SerializedProgressAction | null;
  progressSecondaryAction: SerializedProgressAction | null;
  activeJobId: string | null;
  activeJobStatus: string | null;
  /** Non-archived quotes, newest first. */
  quotes: SerializedQuoteSummary[];
  /** /sales/[id] */
  salesIntakeHref: string;
  /** /quotes/new?salesIntakeId=[id] */
  newQuoteHref: string;
  /** Jobsite / project address when known from this sales intake. */
  jobsiteAddressLine: string | null;
};

/* ─── Adapter: SerializedSalesIntakeRow → SalesIntakeWorkSurface props ─────────────────── */

function adaptSalesIntakeRow(salesIntake: SerializedSalesIntakeRow): {
  data: SalesIntakeWorkSurfaceData;
  linkedQuotes: SalesIntakeWorkSurfaceQuote[];
} {
  const linkedQuotes: SalesIntakeWorkSurfaceQuote[] = salesIntake.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    statusLabel: q.statusLabel,
    statusTone: q.statusTone,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    href: q.href,
  }));

  const data: SalesIntakeWorkSurfaceData = {
    id: salesIntake.id,
    title: salesIntake.title,
    contactName: salesIntake.contactName,
    email: salesIntake.email,
    phone: salesIntake.phone,
    notes: salesIntake.notes,
    source: salesIntake.source,
    sourceLabel: salesIntake.sourceLabel,
    statusLabel: salesIntake.statusLabel,
    statusTone: salesIntake.statusTone,
    customerId: salesIntake.customerId,
    customerDisplayName: salesIntake.customerDisplayName,
    customerHref: salesIntake.customerHref,
    createdAtLabel: salesIntake.createdAtLabel,
    salesIntakeHref: salesIntake.salesIntakeHref,
    editHref: `${salesIntake.salesIntakeHref}/edit`,
    newQuoteHref: salesIntake.newQuoteHref,
    progressLabel: salesIntake.progressLabel,
    progressDescription: salesIntake.progressDescription,
    progressTone: salesIntake.progressTone,
    progressState: salesIntake.progressState,
    progressPrimaryAction: salesIntake.progressPrimaryAction,
    progressSecondaryAction: salesIntake.progressSecondaryAction,
    activeQuoteId: salesIntake.quotes[0]?.id ?? null,
    activeJobId: salesIntake.activeJobId,
    activeJobStatus: salesIntake.activeJobStatus,
    jobsiteAddressLine: salesIntake.jobsiteAddressLine,
  };

  return { data, linkedQuotes };
}

/* ─── Compact sales intake row ───────────────────────────────────────────────────── */

function SalesIntakeRow({
  salesIntake,
  active,
  onOpen,
}: {
  salesIntake: SerializedSalesIntakeRow;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors",
        active ? "bg-background" : "hover:bg-background/60",
      ].join(" ")}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-foreground leading-snug">
            {salesIntake.title}
          </span>
          <StatusBadge label={salesIntake.progressLabel} tone={salesIntake.progressTone} />
        </div>
        <p className="text-xs text-foreground-muted truncate mb-1.5">
          {salesIntake.contactName ?? salesIntake.email ?? "No contact"}
        </p>
        <div className="flex flex-wrap gap-x-2 text-xs text-foreground-subtle">
          <span>{salesIntake.sourceLabel}</span>
          <span>·</span>
          <span>{salesIntake.ageLabel}</span>
          <span>·</span>
          {salesIntake.valueLabel && (
            <>
              <span>{salesIntake.valueLabel}</span>
              <span>·</span>
            </>
          )}
          <span>{salesIntake.createdAtLabel}</span>
          {salesIntake.customerDisplayName && (
            <>
              <span>·</span>
              <span>{salesIntake.customerDisplayName}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5 rounded-md border border-border px-2 py-1 text-xs text-foreground-subtle hover:border-border-strong hover:text-foreground transition-colors">
        Open
        <ArrowUpRight className="w-3 h-3 ml-0.5" strokeWidth={1.5} />
      </div>
    </button>
  );
}

/* ─── Workspace content (popup chrome + SalesIntakeWorkSurface body) ───────────── */

function WorkspaceContent({
  salesIntake,
  onClose,
  onQuoteStarted,
}: {
  salesIntake: SerializedSalesIntakeRow;
  onClose: () => void;
  onQuoteStarted: (args: {
    quoteId: string;
    activeQuotePayload: SalesIntakeWorkSurfaceActiveQuotePayload | null;
  }) => void;
}) {
  const { data, linkedQuotes } = adaptSalesIntakeRow(salesIntake);

  /* Lazy loader for the active-quote QuoteWorkSurface payload — keeps the
   * sales-intakes-list query slim (no per-row readiness fetches) while still letting
   * the popup show the same QuoteWorkSurface that Workstation + the Sales Intake
   * full page show. The server action derives the active quote id itself, so
   * we never trust a client-provided quote id here. */
  const loadActiveQuoteWorkSurface = useCallback(
    () => loadSalesIntakeActiveQuoteWorkSurfaceAction(salesIntake.id),
    [salesIntake.id],
  );

  /* Same pattern for the Service address context — fetched on first paint of
   * the Contact tab so the sales-intakes-list query stays slim (no per-row service-
   * location join). The action is org-scoped server-side. */
  const loadServiceAddressContext = useCallback(
    () => loadSalesIntakeServiceAddressContextAction(salesIntake.id),
    [salesIntake.id],
  );

  return (
    <div className="flex max-h-[88vh] flex-col">
      {/* ── Header (popup chrome — status badge, source, close, identity) ── */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <StatusBadge label={salesIntake.progressLabel} tone={salesIntake.progressTone} />
            <span className="text-xs text-foreground-subtle">
              {salesIntake.sourceLabel} · {salesIntake.ageLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {salesIntake.valueLabel && (
              <div className="rounded-lg border border-border bg-background px-4 py-2 text-right">
                <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wide leading-none mb-0.5">
                  Value
                </p>
                <p className="text-lg font-semibold text-foreground tabular-nums leading-tight">
                  {salesIntake.valueLabel}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close workspace"
              className="rounded-lg border border-border bg-surface p-2 text-foreground-subtle hover:text-foreground hover:bg-background transition-colors"
            >
              <X className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        <div className="mt-4">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight leading-tight">
            {salesIntake.customerDisplayName ?? salesIntake.title}
          </h2>
          {salesIntake.customerDisplayName && salesIntake.title !== salesIntake.customerDisplayName && (
            <p className="text-sm text-foreground-muted mt-0.5">{salesIntake.title}</p>
          )}
        </div>
      </div>

      {/* ── Body — Sales Intake Work Surface (standard mode) ─────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <SalesIntakeWorkSurface
          mode="standard"
          salesIntake={data}
          linkedQuotes={linkedQuotes}
          loadActiveQuoteWorkSurface={loadActiveQuoteWorkSurface}
          loadServiceAddressContext={loadServiceAddressContext}
          onQuoteStarted={onQuoteStarted}
        />
      </div>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

const mutedLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export function SalesIntakesListClient({
  salesIntakes,
  orgHasSalesIntakes,
}: {
  salesIntakes: SerializedSalesIntakeRow[];
  orgHasSalesIntakes: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openSalesIntakeId, setOpenSalesIntakeId] = useState<string | null>(null);
  const [lastOpenSalesIntake, setLastOpenSalesIntake] = useState<SerializedSalesIntakeRow | null>(null);

  const currentOpenSalesIntake = salesIntakes.find((l) => l.id === openSalesIntakeId) ?? null;

  useEffect(() => {
    if (currentOpenSalesIntake) {
      setLastOpenSalesIntake(currentOpenSalesIntake);
    }
  }, [currentOpenSalesIntake]);

  const openSalesIntake = openSalesIntakeId ? (currentOpenSalesIntake || lastOpenSalesIntake) : null;

  const handleQuoteStarted = useCallback(
    (args: {
      quoteId: string;
      activeQuotePayload: SalesIntakeWorkSurfaceActiveQuotePayload | null;
    }) => {
      setLastOpenSalesIntake((prev) => {
        if (!prev || prev.id !== openSalesIntakeId) return prev;
        return patchSerializedSalesIntakeRowAfterQuoteStarted(prev, args);
      });
    },
    [openSalesIntakeId],
  );

  /* Sync native dialog open/close state */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openSalesIntakeId && !dialog.open) {
      dialog.showModal();
    } else if (!openSalesIntakeId && dialog.open) {
      dialog.close();
    }
  }, [openSalesIntakeId]);

  /* Reset state when user presses Escape (native cancel) */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel() {
      setOpenSalesIntakeId(null);
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  function openWorkspace(id: string) {
    setOpenSalesIntakeId(id);
  }

  function closeWorkspace() {
    dialogRef.current?.close();
    setOpenSalesIntakeId(null);
  }

  return (
    <>
      {/* ── Sales Intake rows ─────────────────────────────────────────────────── */}
      {salesIntakes.length === 0 && !openSalesIntakeId ? (
        <div className="p-6">
          <EmptyState
            icon={Inbox}
            title="Queue is empty"
            description={
              orgHasSalesIntakes
                ? "All active sales intakes have progressed to proposals."
                : "No sales intakes yet. Add one when a call, walk-in, or message comes in."
            }
          >
            <div className="flex flex-col items-center gap-4">
              {orgHasSalesIntakes ? (
                <Link href="/sales?tab=proposals" className={mutedLinkClass}>
                  View Proposals
                </Link>
              ) : null}
              <Link href="/sales/new" className={primaryLinkClass}>
                New sales intake
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {salesIntakes.map((salesIntake) => (
            <SalesIntakeRow
              key={salesIntake.id}
              salesIntake={salesIntake}
              active={salesIntake.id === openSalesIntakeId}
              onOpen={() => openWorkspace(salesIntake.id)}
            />
          ))}
        </div>
      )}

      {/* ── Sales Intake Workspace dialog ──────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWorkspace();
        }}
      >
        {openSalesIntake && (
          /* Key by salesIntake.id so internal state (active tab, edit form) resets
             cleanly when the user opens a different sales intake. */
          <WorkspaceContent
            key={openSalesIntake.id}
            salesIntake={openSalesIntake}
            onClose={closeWorkspace}
            onQuoteStarted={handleQuoteStarted}
          />
        )}
      </dialog>
    </>
  );
}
