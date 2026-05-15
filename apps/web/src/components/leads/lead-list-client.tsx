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
import { ArrowUpRight, Users, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  loadLeadCommercialSurfaceAction,
} from "@/app/(workspace)/leads/lead-workspace-actions";
import { LeadCommercialSurface } from "@/components/work-surfaces/lead-commercial-surface";
import { type LeadCommercialSurfacePayload } from "@/lib/lead-commercial-surface/loader";
import { Loader2 } from "lucide-react";
import { type SerializedLeadRow } from "@/lib/serialize-lead-list-row";

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
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<LeadCommercialSurfacePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setIsLoading(true);
    });
    loadLeadCommercialSurfaceAction(leadId).then((result) => {
      if (!active) return;
      if (result.ok) {
        setPayload(result.payload);
      } else {
        console.error(result.error);
      }
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [leadId]);

  return (
    <div className="flex max-h-[88vh] flex-col relative min-h-[400px]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close workspace"
        className="absolute right-4 top-4 z-20 rounded-lg border border-border bg-surface p-2 text-foreground-subtle hover:text-foreground hover:bg-background transition-colors"
      >
        <X className="w-5 h-5" strokeWidth={1.5} />
      </button>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-accent/20" />
        </div>
      ) : payload ? (
        <div className="flex-1 overflow-y-auto">
          <LeadCommercialSurface
            payload={payload}
            entryPoint="record"
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-12 text-center">
          <p className="text-sm text-foreground-muted">Failed to load opportunity details.</p>
        </div>
      )}
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
      {leads.length === 0 && !openLeadId ? (
        <div className="p-6">
          <EmptyState
            icon={Users}
            title="Queue is empty"
            description={
              orgHasLeads
                ? "All active opportunities have progressed to jobs or are archived."
                : "No opportunities yet. Add one when a call, walk-in, or message comes in."
            }
          >
            <div className="flex flex-col items-center gap-4">
              <Link href="/leads/new" className={primaryLinkClass}>
                New intake
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

      {/* ── Opportunity Workspace dialog ──────────────────────────────────────── */}
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-xl outline-none [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeWorkspace();
        }}
      >
        {openLeadId && (
          /* Key by lead.id so internal state resets cleanly when the user 
             opens a different record. */
          <WorkspaceContent
            key={openLeadId}
            leadId={openLeadId}
            onClose={closeWorkspace}
          />
        )}
      </dialog>
    </>
  );
}
