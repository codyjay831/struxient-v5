"use client";

/**
 * LeadsListClient — client component for the real Leads page.
 *
 * The popup body is rendered by `LeadWorkSurface` (mode="standard"). This file
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
  LeadWorkSurface,
  type LeadWorkSurfaceActiveQuotePayload,
  type LeadWorkSurfaceData,
  type LeadWorkSurfaceQuote,
} from "@/components/work-surfaces/lead-work-surface";
import {
  patchSerializedLeadRowAfterQuoteStarted,
} from "@/lib/lead-graduation-lifecycle";
import {
  type LeadWorkSurfaceProgressAction,
} from "@/lib/lead-commercial-progress";
import {
  loadLeadActiveQuoteWorkSurfaceAction,
  loadLeadServiceAddressContextAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";

import {
  type SerializedLeadRow,
  type SerializedQuoteSummary,
  type SerializedProgressAction,
} from "@/lib/serialize-lead-list-row";

import { adaptLeadRow } from "@/lib/lead-work-surface-adapters";

/* ─── Compact lead row ───────────────────────────────────────────────────── */

function LeadRow({
  lead,
  active,
  onOpen,
}: {
  lead: SerializedLeadRow;
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
            {lead.title}
          </span>
          <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
        </div>
        <p className="text-xs text-foreground-muted truncate mb-1.5">
          {lead.contactName ?? lead.email ?? "No contact"}
        </p>
        <div className="flex flex-wrap gap-x-2 text-xs text-foreground-subtle">
          <span>{lead.sourceLabel}</span>
          <span>·</span>
          <span>{lead.ageLabel}</span>
          <span>·</span>
          {lead.valueLabel && (
            <>
              <span>{lead.valueLabel}</span>
              <span>·</span>
            </>
          )}
          <span>{lead.createdAtLabel}</span>
          {lead.customerDisplayName && (
            <>
              <span>·</span>
              <span>{lead.customerDisplayName}</span>
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

/* ─── Workspace content (popup chrome + LeadWorkSurface body) ───────────── */

function WorkspaceContent({
  lead,
  onClose,
  onQuoteStarted,
}: {
  lead: SerializedLeadRow;
  onClose: () => void;
  onQuoteStarted: (args: {
    quoteId: string;
    activeQuotePayload: LeadWorkSurfaceActiveQuotePayload | null;
  }) => void;
}) {
  const { data, linkedQuotes } = adaptLeadRow(lead);

  /* Lazy loader for the active-quote QuoteWorkSurface payload — keeps the
   * leads-list query slim (no per-row readiness fetches) while still letting
   * the popup show the same QuoteWorkSurface that Workstation + the Lead
   * full page show. The server action derives the active quote id itself, so
   * we never trust a client-provided quote id here. */
  const loadActiveQuoteWorkSurface = useCallback(
    () => loadLeadActiveQuoteWorkSurfaceAction(lead.id),
    [lead.id],
  );

  /* Same pattern for the Service address context — fetched on first paint of
   * the Contact tab so the leads-list query stays slim (no per-row service-
   * location join). The action is org-scoped server-side. */
  const loadServiceAddressContext = useCallback(
    () => loadLeadServiceAddressContextAction(lead.id),
    [lead.id],
  );

  return (
    <div className="flex max-h-[88vh] flex-col">
      {/* ── Header (popup chrome — status badge, source, close, identity) ── */}
      <div className="shrink-0 border-b border-border px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
            <span className="text-xs text-foreground-subtle">
              {lead.sourceLabel} · {lead.ageLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lead.valueLabel && (
              <div className="rounded-lg border border-border bg-background px-4 py-2 text-right">
                <p className="text-[10px] font-medium text-foreground-subtle uppercase tracking-wide leading-none mb-0.5">
                  Value
                </p>
                <p className="text-lg font-semibold text-foreground tabular-nums leading-tight">
                  {lead.valueLabel}
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
            {lead.customerDisplayName ?? lead.title}
          </h2>
          {lead.customerDisplayName && lead.title !== lead.customerDisplayName && (
            <p className="text-sm text-foreground-muted mt-0.5">{lead.title}</p>
          )}
        </div>
      </div>

      {/* ── Body — Lead Work Surface (standard mode) ─────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <LeadWorkSurface
          mode="standard"
          lead={data}
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

export function LeadsListClient({
  leads,
  orgHasLeads,
}: {
  leads: SerializedLeadRow[];
  orgHasLeads: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [pinnedLead, setPinnedLead] = useState<SerializedLeadRow | null>(null);

  const listLead = openLeadId ? (leads.find((l) => l.id === openLeadId) ?? null) : null;
  const openLead = openLeadId ? (listLead ?? pinnedLead) : null;

  const handleQuoteStarted = useCallback(
    (args: {
      quoteId: string;
      activeQuotePayload: LeadWorkSurfaceActiveQuotePayload | null;
    }) => {
      setPinnedLead((prev) => {
        const base = leads.find((l) => l.id === openLeadId) ?? prev;
        if (!base || base.id !== openLeadId) return prev;
        return patchSerializedLeadRowAfterQuoteStarted(base, args);
      });
    },
    [openLeadId, leads],
  );

  /* Sync native dialog open/close state */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openLeadId && !dialog.open) {
      dialog.showModal();
    } else if (!openLeadId && dialog.open) {
      dialog.close();
    }
  }, [openLeadId]);

  /* Reset state when user presses Escape (native cancel) */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleCancel() {
      setOpenLeadId(null);
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  function openWorkspace(id: string) {
    setPinnedLead(leads.find((l) => l.id === id) ?? null);
    setOpenLeadId(id);
  }

  function closeWorkspace() {
    dialogRef.current?.close();
    setOpenLeadId(null);
    setPinnedLead(null);
  }

  return (
    <>
      {/* ── Lead rows ─────────────────────────────────────────────────── */}
      {leads.length === 0 && !openLeadId ? (
        <div className="p-6">
          <EmptyState
            icon={Inbox}
            title="Queue is empty"
            description={
              orgHasLeads
                ? "All active leads have progressed to proposals."
                : "No leads yet. Add one when a call, walk-in, or message comes in."
            }
          >
            <div className="flex flex-col items-center gap-4">
              {orgHasLeads ? (
                <Link href="/quotes" className={mutedLinkClass}>
                  View Proposals
                </Link>
              ) : null}
              <Link href="/leads/new" className={primaryLinkClass}>
                New lead
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {leads.map((lead) => (
            <LeadRow
              key={lead.id}
              lead={lead}
              active={lead.id === openLeadId}
              onOpen={() => openWorkspace(lead.id)}
            />
          ))}
        </div>
      )}

      {/* ── Lead Workspace dialog ──────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWorkspace();
        }}
      >
        {openLead && (
          /* Key by lead.id so internal state (active tab, edit form) resets
             cleanly when the user opens a different lead. */
          <WorkspaceContent
            key={openLead.id}
            lead={openLead}
            onClose={closeWorkspace}
            onQuoteStarted={handleQuoteStarted}
          />
        )}
      </dialog>
    </>
  );
}
