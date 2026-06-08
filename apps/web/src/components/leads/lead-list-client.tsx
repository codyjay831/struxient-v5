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
import { useCallback, useMemo, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CenteredWorkspaceDialog } from "@/components/ui/centered-workspace-dialog";
import { LeadWorkspaceDialogBody } from "@/components/work-surfaces/lead-workspace-dialog-body";
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
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  const toneDotClass =
    lead.progressTone === "approved"
      ? "bg-success"
      : lead.progressTone === "sent"
        ? "bg-accent"
        : lead.progressTone === "warning"
          ? "bg-warning"
          : "bg-foreground-subtle";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`Open opportunity: ${lead.title}`}
      className={[
        "w-full cursor-pointer border-l-2 px-4 py-3.5 text-left transition-colors",
        active
          ? "border-accent bg-background"
          : "border-transparent hover:bg-background/60",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toneDotClass}`} />
      </div>
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
              {lead.customerHref ? (
                <Link
                  href={lead.customerHref}
                  onClick={(event) => event.stopPropagation()}
                  className="underline-offset-2 hover:underline hover:text-foreground"
                >
                  {lead.customerDisplayName}
                </Link>
              ) : (
                <span>{lead.customerDisplayName}</span>
              )}
            </>
          )}
        </div>
        {lead.nextStepLabel ? (
          <p className="mt-1 text-xs text-foreground-muted">
            Next: {lead.nextStepLabel}
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5 rounded-md border border-border px-2 py-1 text-xs text-foreground-subtle hover:border-border-strong hover:text-foreground transition-colors">
        Open
        <ArrowUpRight className="w-3 h-3 ml-0.5" strokeWidth={1.5} />
      </div>
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export function LeadsListClient({
  leads,
  orgHasLeads,
}: {
  leads: SerializedLeadRow[];
  orgHasLeads: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const leadIds = useMemo(() => new Set(leads.map((lead) => lead.id)), [leads]);
  const openParam = searchParams.get("open");
  const openLeadId = openParam && leadIds.has(openParam) ? openParam : null;

  const writeOpenParam = useCallback(
    (leadId: string | null, mode: "push" | "replace") => {
      const params = new URLSearchParams(searchParams.toString());
      if (leadId) params.set("open", leadId);
      else params.delete("open");
      const nextHref = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      if (mode === "push") {
        router.push(nextHref, { scroll: false });
      } else {
        router.replace(nextHref, { scroll: false });
      }
    },
    [pathname, router, searchParams],
  );

  const openWorkspace = useCallback((id: string) => {
    writeOpenParam(id, "push");
  }, [writeOpenParam]);

  const closeWorkspace = useCallback(() => {
    writeOpenParam(null, "replace");
  }, [writeOpenParam]);

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

      <CenteredWorkspaceDialog open={openLeadId != null} onClose={closeWorkspace}>
        {openLeadId ? (
          <LeadWorkspaceDialogBody
            key={openLeadId}
            leadId={openLeadId}
            onClose={closeWorkspace}
          />
        ) : null}
      </CenteredWorkspaceDialog>
    </>
  );
}
