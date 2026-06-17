"use client";

/**
 * LeadsBoardClient — derived condition board for the Sales page.
 *
 * Cards are placed by actionable board lanes from getOpportunityFlow().conditionCode.
 * No drag-and-drop; movement happens when stored facts change and the page refreshes.
 */

import Link from "next/link";
import { useCallback, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { CenteredWorkspaceDialog } from "@/components/ui/centered-workspace-dialog";
import { LeadWorkspaceDialogBody } from "@/components/work-surfaces/lead-workspace-dialog-body";
import { type SerializedLeadRow } from "@/lib/serialize-lead-list-row";
import {
  formatOpportunityPhaseLabel,
  formatSalesBoardLaneLabel,
  groupRowsBySalesBoardLane,
  salesBoardLanesForPipeline,
  sortRowsByConditionAge,
  type SalesBoardLane,
} from "@/lib/opportunity-board";
import type { LeadListPipelineParam } from "@/lib/lead-list-query";

const primaryActionClass =
  "inline-flex items-center justify-center rounded-md border border-border bg-accent px-2.5 py-1 text-[0.7rem] font-medium text-accent-contrast transition-opacity hover:opacity-90";

function OpportunityBoardCard({
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

  const stopPropagation = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const phaseLabel = formatOpportunityPhaseLabel(lead.opportunityFlow.phase);
  const primaryAction = lead.progressPrimaryAction;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`Open opportunity: ${lead.title}`}
      className={[
        "rounded-lg border bg-surface p-3 text-left shadow-sm transition-colors cursor-pointer",
        active
          ? "border-accent ring-1 ring-accent/30"
          : "border-border hover:border-border-strong hover:bg-background",
      ].join(" ")}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
            {lead.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-foreground-muted">
            {lead.contactName ?? lead.email ?? "No contact"}
          </p>
        </div>
        <ArrowUpRight
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground-subtle"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-foreground-subtle">
          {phaseLabel}
        </span>
        <StatusBadge label={lead.progressLabel} tone={lead.progressTone} />
      </div>

      <div className="mb-2 flex flex-wrap gap-x-2 text-[0.65rem] text-foreground-subtle">
        {lead.opportunityFlow.ageLabel ? (
          <span className="font-medium text-foreground-muted">{lead.opportunityFlow.ageLabel}</span>
        ) : null}
        {lead.valueLabel ? (
          <>
            {lead.opportunityFlow.ageLabel ? <span>·</span> : null}
            <span>{lead.valueLabel}</span>
          </>
        ) : null}
        <span>·</span>
        <span>{lead.sourceLabel}</span>
      </div>

      {lead.requiredItems.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {lead.requiredItems.slice(0, 3).map((req) => (
            <span
              key={req}
              className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] text-foreground-muted"
            >
              {req}
            </span>
          ))}
        </div>
      ) : null}

      {primaryAction ? (
        <Link
          href={primaryAction.href}
          onClick={stopPropagation}
          className={`${primaryActionClass} w-full`}
        >
          {primaryAction.label}
        </Link>
      ) : (
        <p className="text-xs text-foreground-muted">Open for details</p>
      )}
    </div>
  );
}

function BoardColumn({
  lane,
  leads,
  openLeadId,
  onOpen,
}: {
  lane: SalesBoardLane;
  leads: SerializedLeadRow[];
  openLeadId: string | null;
  onOpen: (id: string) => void;
}) {
  const label = formatSalesBoardLaneLabel(lane);

  return (
    <section
      aria-label={`${label}, ${leads.length} opportunit${leads.length === 1 ? "y" : "ies"}`}
      className="flex w-[17rem] shrink-0 flex-col rounded-xl border border-border bg-background/40"
    >
      <header className="border-b border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-foreground">{label}</h3>
          <span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] tabular-nums text-foreground-muted">
            {leads.length}
          </span>
        </div>
      </header>
      <div className="flex min-h-[8rem] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {leads.length === 0 ? (
          <p className="px-1 py-4 text-center text-[0.7rem] text-foreground-subtle">Empty</p>
        ) : (
          leads.map((lead) => (
            <OpportunityBoardCard
              key={lead.id}
              lead={lead}
              active={lead.id === openLeadId}
              onOpen={() => onOpen(lead.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function LeadsBoardClient({
  leads,
  pipeline,
  orgHasLeads,
}: {
  leads: SerializedLeadRow[];
  pipeline: LeadListPipelineParam;
  orgHasLeads: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const leadIds = useMemo(() => new Set(leads.map((lead) => lead.id)), [leads]);
  const openParam = searchParams.get("open");
  const openLeadId = openParam && leadIds.has(openParam) ? openParam : null;

  const lanes = useMemo(() => salesBoardLanesForPipeline(pipeline), [pipeline]);

  const grouped = useMemo(() => {
    const map = groupRowsBySalesBoardLane(leads);
    for (const lane of lanes) {
      const bucket = map.get(lane);
      if (bucket) map.set(lane, sortRowsByConditionAge(bucket));
    }
    return map;
  }, [lanes, leads]);

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

  const openWorkspace = useCallback(
    (id: string) => {
      writeOpenParam(id, "push");
    },
    [writeOpenParam],
  );

  const closeWorkspace = useCallback(() => {
    writeOpenParam(null, "replace");
  }, [writeOpenParam]);

  if (leads.length === 0 && !openLeadId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Users}
          title="Queue is empty"
          description={
            orgHasLeads
              ? "All active opportunities have progressed to jobs or are archived."
              : "No opportunities yet. Add one when a call, walk-in, or message comes in."
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto p-4">
        <div className="flex min-w-min gap-3 pb-1">
          {lanes.map((lane) => (
            <BoardColumn
              key={lane}
              lane={lane}
              leads={grouped.get(lane) ?? []}
              openLeadId={openLeadId}
              onOpen={openWorkspace}
            />
          ))}
        </div>
      </div>

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
