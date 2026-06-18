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
import { useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Drawer } from "@/components/ui/drawer";
import { LeadWorkspaceDialogBody } from "@/components/work-surfaces/lead-workspace-dialog-body";
import { type SerializedLeadRow } from "@/lib/serialize-lead-list-row";
import { leadRowMatchesPipeline } from "@/lib/lead-list-query";

/* ─── Compact lead row ───────────────────────────────────────────────────── */

function LeadRow({
  lead,
  active,
  onOpen,
}: {
  lead: SerializedLeadRow;
  active: boolean;
  onOpen: (trigger: HTMLDivElement) => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(event.currentTarget);
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
  const workLabel =
    lead.title && lead.title !== "New lead" && lead.title !== "Untitled Request"
      ? lead.title
      : null;
  const secondaryParts = [workLabel, lead.jobsiteAddressLine].filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(event) => onOpen(event.currentTarget)}
      onKeyDown={onKeyDown}
      aria-label={`Open lead: ${lead.title}`}
      className={[
        "group relative flex w-full cursor-pointer flex-col gap-2 border-l-2 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-row sm:items-center sm:gap-4",
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
        {secondaryParts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-foreground-muted">
            {workLabel ? <span className="max-w-[20rem] truncate">{workLabel}</span> : null}
            {workLabel && lead.jobsiteAddressLine ? <span aria-hidden>·</span> : null}
            {lead.jobsiteAddressLine ? (
              <span className="max-w-[12rem] truncate">{lead.jobsiteAddressLine}</span>
            ) : null}
          </div>
        ) : null}

        {/* Operational: next required action or blocked/waiting reason; age */}
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-subtle mt-0.5">
          {lead.progressDescription ? (
            <span className="font-medium text-foreground-muted">{lead.progressDescription}</span>
          ) : null}
          {lead.progressDescription ? (
            <span aria-hidden>·</span>
          ) : null}
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
  selectedLeadId,
}: {
  leads: SerializedLeadRow[];
  orgHasLeads: boolean;
  selectedLeadId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const leadIds = useMemo(() => new Set(leads.map((lead) => lead.id)), [leads]);
  const openParam = searchParams.get("lead");
  const openLeadId =
    openParam && (leadIds.has(openParam) || openParam === selectedLeadId) ? openParam : null;

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

  const openWorkspace = useCallback((id: string, trigger: HTMLElement) => {
    returnFocusRef.current = trigger;
    writeOpenParam(id, "push");
  }, [writeOpenParam]);

  const closeWorkspace = useCallback(() => {
    writeOpenParam(null, "replace");
  }, [writeOpenParam]);

  const needsActionLeads = leads.filter((l) => leadRowMatchesPipeline("needs_action", l.progressState));
  const waitingLeads = leads.filter((l) => leadRowMatchesPipeline("waiting", l.progressState));
  const scheduledLeads = leads.filter((l) => leadRowMatchesPipeline("scheduled", l.progressState));
  const awardedLeads = leads.filter((l) => leadRowMatchesPipeline("awarded", l.progressState));
  const closedLeads = leads.filter((l) => leadRowMatchesPipeline("closed", l.progressState));

  // If the pipeline filter is active, we might just have all leads in one group.
  // But we can just render the groups that have items.
  const groups = [
    { id: "needs_action", label: "Needs action", items: needsActionLeads },
    { id: "waiting", label: "Waiting", items: waitingLeads },
    { id: "scheduled", label: "Scheduled", items: scheduledLeads },
    { id: "awarded", label: "Awarded", items: awardedLeads },
    { id: "closed", label: "Closed", items: closedLeads },
  ].filter(g => g.items.length > 0);

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
                ? "All active leads have progressed to jobs or are closed."
                : "No leads yet. Add one when a call, walk-in, or message comes in."
            }
          >
            <div className="flex flex-col items-center gap-4">
              <Link href="/leads/new" className={primaryLinkClass}>
                Add lead
              </Link>
            </div>
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id} aria-labelledby={`group-${group.id}`}>
              <h3
                id={`group-${group.id}`}
                className="mb-2 px-1 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle"
              >
                {group.label} · {group.items.length}
              </h3>
              <div className="divide-y divide-border rounded-lg border border-border bg-surface shadow-sm overflow-hidden">
                {group.items.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    active={lead.id === openLeadId}
                    onOpen={(trigger) => openWorkspace(lead.id, trigger)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <Drawer
        open={openLeadId != null}
        onClose={closeWorkspace}
        ariaLabel="Lead details"
        returnFocusRef={returnFocusRef}
      >
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
