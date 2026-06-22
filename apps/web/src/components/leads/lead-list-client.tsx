"use client";

/**
 * LeadsListClient — Sales pipeline list. Row clicks navigate to the full lead
 * record at `/leads/[id]` (no in-list popup). Workstation keeps its own drawer.
 */

import Link from "next/link";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { type SerializedLeadRow } from "@/lib/serialize-lead-list-row";
import { leadRowMatchesPipeline } from "@/lib/lead-list-query";

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function LeadRow({ lead }: { lead: SerializedLeadRow }) {
  const primaryName =
    lead.customerDisplayName ??
    lead.contactName ??
    lead.companyName ??
    lead.email ??
    "Unknown contact";
  const requestTypeLabel = trimOrNull(lead.requestType);
  const addressLine = trimOrNull(lead.jobsiteAddressLine);
  const scopePreview = trimOrNull(lead.scopeSummary);
  const ageLabel = lead.opportunityFlow.ageLabel || lead.ageLabel;

  return (
    <div className="group relative flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Link
        href={lead.leadHref}
        aria-label={`Open lead: ${lead.title}`}
        className="flex min-w-0 flex-1 flex-col gap-2 border-l-2 border-transparent px-4 py-3 text-left transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-row sm:items-center sm:gap-4"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold leading-none text-foreground">{primaryName}</span>
            <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
          </div>

          {addressLine ? (
            <p className="max-w-3xl truncate text-sm text-foreground-muted">{addressLine}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-subtle">
            {requestTypeLabel ? (
              <span className="max-w-[18rem] truncate font-medium text-foreground-muted">
                {requestTypeLabel}
              </span>
            ) : null}
            {requestTypeLabel ? <span aria-hidden>·</span> : null}
            <span>{ageLabel}</span>
            {lead.valueLabel ? (
              <>
                <span aria-hidden>·</span>
                <span>{lead.valueLabel}</span>
              </>
            ) : null}
          </div>

          {scopePreview ? (
            <p className="max-w-3xl truncate text-xs text-foreground-muted">
              {scopePreview}
            </p>
          ) : null}
        </div>
      </Link>

      {lead.progressPrimaryAction ? (
        <div className="flex shrink-0 items-center px-4 pb-3 sm:mt-0 sm:px-0 sm:pb-0 sm:pr-4">
          <Link
            href={lead.progressPrimaryAction.href}
            className="inline-flex items-center justify-center rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {lead.progressPrimaryAction.label}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const primaryLinkClass =
  "inline-flex items-center rounded-lg border border-border bg-accent px-3 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90";

export function LeadsListClient({
  leads,
  orgHasLeads,
}: {
  leads: SerializedLeadRow[];
  orgHasLeads: boolean;
}) {
  const needsActionLeads = leads.filter((l) =>
    leadRowMatchesPipeline("needs_action", l.progressState),
  );
  const waitingLeads = leads.filter((l) => leadRowMatchesPipeline("waiting", l.progressState));
  const scheduledLeads = leads.filter((l) =>
    leadRowMatchesPipeline("scheduled", l.progressState),
  );
  const awardedLeads = leads.filter((l) => leadRowMatchesPipeline("awarded", l.progressState));
  const closedLeads = leads.filter((l) => leadRowMatchesPipeline("closed", l.progressState));

  const groups = [
    { id: "needs_action", label: "Needs action", items: needsActionLeads },
    { id: "waiting", label: "Waiting", items: waitingLeads },
    { id: "scheduled", label: "Scheduled", items: scheduledLeads },
    { id: "awarded", label: "Awarded", items: awardedLeads },
    { id: "closed", label: "Closed", items: closedLeads },
  ].filter((g) => g.items.length > 0);

  if (leads.length === 0) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`group-${group.id}`}>
          <h3
            id={`group-${group.id}`}
            className="mb-2 px-1 text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle"
          >
            {group.label} · {group.items.length}
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
            {group.items.map((lead) => (
              <LeadRow key={lead.id} lead={lead} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
