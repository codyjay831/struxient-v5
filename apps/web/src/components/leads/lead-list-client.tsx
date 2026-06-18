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
import { Drawer } from "@/components/ui/drawer";
import { LeadWorkspaceDialogBody } from "@/components/work-surfaces/lead-workspace-dialog-body";
import { type SerializedLeadRow } from "@/lib/serialize-lead-list-row";
import { formatOpportunityPhaseLabel } from "@/lib/opportunity-board";

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

  const primaryName = lead.customerDisplayName ?? lead.contactName ?? lead.companyName ?? lead.email ?? "Unknown contact";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`Open opportunity: ${lead.title}`}
      className={[
        "group relative flex w-full cursor-pointer flex-col gap-2 border-l-2 px-4 py-3.5 text-left transition-colors sm:flex-row sm:items-start sm:gap-4",
        active
          ? "border-accent bg-background"
          : "border-transparent hover:bg-background/60",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Primary: customer name; concise commercial state */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={`h-2 w-2 shrink-0 rounded-full ${toneDotClass}`} aria-hidden />
          <span className="text-sm font-semibold text-foreground leading-none">
            {primaryName}
          </span>
          <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
        </div>

        {/* Secondary: requested work; city/location */}
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-foreground-muted">
          <span className="truncate max-w-[20rem]">{lead.title}</span>
          {lead.jobsiteAddressLine && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate max-w-[12rem]">{lead.jobsiteAddressLine}</span>
            </>
          )}
        </div>

        {/* Operational: next required action or blocked/waiting reason; age */}
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-subtle mt-0.5">
          {lead.nextStepLabel ? (
            <span className="font-medium text-foreground-muted">Next: {lead.nextStepLabel}</span>
          ) : lead.progressDescription ? (
            <span className="font-medium text-foreground-muted">{lead.progressDescription}</span>
          ) : null}
          <span aria-hidden>·</span>
          <span>{lead.opportunityFlow.ageLabel || lead.ageLabel}</span>
          {lead.valueLabel && (
            <>
              <span aria-hidden>·</span>
              <span>{lead.valueLabel}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2 sm:mt-0">
        {lead.progressPrimaryAction ? (
          <Link
            href={lead.progressPrimaryAction.href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {lead.progressPrimaryAction.label}
          </Link>
        ) : null}
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
  const openParam = searchParams.get("lead");
  const openLeadId = openParam && leadIds.has(openParam) ? openParam : null;

  const writeOpenParam = useCallback(
    (leadId: string | null, mode: "push" | "replace") => {
      const params = new URLSearchParams(searchParams.toString());
      if (leadId) params.set("lead", leadId);
      else params.delete("lead");
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

      <Drawer open={openLeadId != null} onClose={closeWorkspace} title="Opportunity Details">
        {openLeadId ? (
          <LeadWorkspaceDialogBody
            key={openLeadId}
            leadId={openLeadId}
            onClose={closeWorkspace}
          />
        ) : null}
      </Drawer>
    </>
  );
}
