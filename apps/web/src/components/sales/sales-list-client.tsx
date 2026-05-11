"use client";

/**
 * LeadsListClient — client component for the real Leads page.
 *
 * The popup body is rendered by `LeadWorkSurface` (mode="standard"). This file
 * owns the list rows + native dialog chrome and adapts the serialized list-row
 * payload into the unified Work Surface props.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  LeadWorkSurface,
  type LeadWorkSurfaceData,
  type LeadWorkSurfaceProgressAction,
  type LeadWorkSurfaceQuote,
} from "@/components/work-surfaces/lead-work-surface";
import {
  loadLeadActiveQuoteWorkSurfaceAction,
  loadLeadServiceAddressContextAction,
} from "@/app/(workspace)/sales/sales-workspace-actions";

/* ─── Serialized types (computed server-side, passed as plain props) ─────── */

export type SerializedProgressAction = LeadWorkSurfaceProgressAction;

export type SerializedQuoteSummary = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

import type { LeadSource } from "@prisma/client";

export type SerializedLeadRow = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: LeadSource;
  sourceLabel: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  /** Server-rendered staleness hint, e.g. `Age 2D 3H`. */
  ageLabel: string;
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
  leadHref: string;
  /** /quotes/new?leadId=[id] */
  newQuoteHref: string;
  /** Jobsite / project address when known from this lead. */
  jobsiteAddressLine: string | null;
};

/* ─── Adapter: SerializedLeadRow → LeadWorkSurface props ─────────────────── */

function adaptLeadRow(lead: SerializedLeadRow): {
  data: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
} {
  const linkedQuotes: LeadWorkSurfaceQuote[] = lead.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    statusLabel: q.statusLabel,
    statusTone: q.statusTone,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    href: q.href,
  }));

  const data: LeadWorkSurfaceData = {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    source: lead.source,
    sourceLabel: lead.sourceLabel,
    statusLabel: lead.statusLabel,
    statusTone: lead.statusTone,
    customerId: lead.customerId,
    customerDisplayName: lead.customerDisplayName,
    customerHref: lead.customerHref,
    createdAtLabel: lead.createdAtLabel,
    leadHref: lead.leadHref,
    editHref: `${lead.leadHref}/edit`,
    newQuoteHref: lead.newQuoteHref,
    progressLabel: lead.progressLabel,
    progressDescription: lead.progressDescription,
    progressTone: lead.progressTone,
    progressState: lead.progressState,
    progressPrimaryAction: lead.progressPrimaryAction,
    progressSecondaryAction: lead.progressSecondaryAction,
    activeQuoteId: lead.quotes[0]?.id ?? null,
    activeJobId: lead.activeJobId,
    activeJobStatus: lead.activeJobStatus,
    jobsiteAddressLine: lead.jobsiteAddressLine,
  };

  return { data, linkedQuotes };
}

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
}: {
  lead: SerializedLeadRow;
  onClose: () => void;
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
        />
      </div>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function LeadsListClient({ leads }: { leads: SerializedLeadRow[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [lastOpenLead, setLastOpenLead] = useState<SerializedLeadRow | null>(null);

  const currentOpenLead = leads.find((l) => l.id === openLeadId) ?? null;

  useEffect(() => {
    if (currentOpenLead) {
      setLastOpenLead(currentOpenLead);
    }
  }, [currentOpenLead]);

  const openLead = openLeadId ? (currentOpenLead || lastOpenLead) : null;

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
    setOpenLeadId(id);
  }

  function closeWorkspace() {
    dialogRef.current?.close();
    setOpenLeadId(null);
  }

  return (
    <>
      {/* ── Lead rows ─────────────────────────────────────────────────── */}
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
          />
        )}
      </dialog>
    </>
  );
}
