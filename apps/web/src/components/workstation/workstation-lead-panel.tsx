"use client";

/**
 * WorkstationLeadPanel — thin loader-and-bindings wrapper around
 * `LeadWorkSurface(mode="compact")`. Workstation now hosts the same Lead UX as
 * the Leads popup and Lead full page; this file only adapts the inputs.
 */

import {
  LeadWorkSurface,
  type LeadWorkSurfaceActiveQuotePayload,
  type LeadWorkSurfaceData,
  type LeadWorkSurfaceQuote,
  type LeadWorkSurfaceVisitRequest,
} from "@/components/work-surfaces/lead-work-surface";
import {
  type LeadWorkSurfaceProgressAction,
} from "@/lib/lead-commercial-progress";
import {
  type LeadCommercialProgress,
  type LeadCommercialProgressAction,
  resolveLeadCommercialProgressActionHref,
} from "@/lib/lead-commercial-progress";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import type { LeadStatus, LeadChannel } from "@prisma/client";
import type { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";

export type WorkstationLeadPanelQuote = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

export type WorkstationLeadPanelProps = {
  leadId: string;
  leadTitle: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes: string | null;
  /** Manual `LeadStatus` enum value (not the derived progress state). */
  statusValue: LeadStatus;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  sourceLabel: string;
  source: LeadChannel;
  createdAtLabel: string;
  customerId: string | null;
  customerDisplayName?: string | null;
  customerHref?: string | null;
  /** Org-scoped customers for optional "link existing"; omitted when lead already has a customer. */
  customersForLink?: { id: string; displayName: string }[];
  /** Non-archived linked quotes, newest first. */
  linkedQuotes: WorkstationLeadPanelQuote[];
  progress: LeadCommercialProgress;
  /** Pre-loaded active-quote QuoteWorkSurface payload (Phase 2 embed). */
  activeQuoteWorkSurface?: LeadWorkSurfaceActiveQuotePayload | null;
  /** Same resolution as Leads list / full lead page (intake + legacy notes). */
  jobsiteAddressLine?: string | null;
  /** Pre-loaded service-address context for the Customer Info block. */
  serviceAddressContext?: LeadServiceAddressContext;
  /** Site visit requests (Phase C). */
  visitRequests?: LeadWorkSurfaceVisitRequest[];
};

function serializeProgressAction(
  action: LeadCommercialProgressAction | null,
  ctx: { leadId: string },
): LeadWorkSurfaceProgressAction | null {
  if (!action) return null;
  const href = resolveLeadCommercialProgressActionHref(action, ctx);
  const opensQuoteTab =
    action.kind === "OPEN_DRAFT_QUOTE" ||
    action.kind === "OPEN_QUOTE" ||
    action.kind === "START_QUOTE";
  const opensContactTab =
    action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
    action.kind === "EDIT_CONTACT_INFO";
  return { href, label: action.label, opensQuoteTab, opensContactTab };
}

export function WorkstationLeadPanel({
  leadId,
  leadTitle,
  contactName,
  email,
  phone,
  notes,
  statusValue,
  statusLabel,
  statusTone,
  sourceLabel,
  source,
  createdAtLabel,
  customerId,
  customerDisplayName,
  customerHref,
  customersForLink,
  linkedQuotes,
  progress,
  activeQuoteWorkSurface,
  jobsiteAddressLine,
  serviceAddressContext,
  visitRequests,
}: WorkstationLeadPanelProps) {
  const data: LeadWorkSurfaceData = {
    id: leadId,
    title: leadTitle,
    contactName: contactName ?? null,
    email: email ?? null,
    phone: phone ?? null,
    notes,
    jobsiteAddressLine: jobsiteAddressLine ?? null,
    sourceLabel,
    source,
    statusLabel,
    statusTone,
    statusValue,
    customerId,
    customerDisplayName: customerDisplayName ?? null,
    customerHref: customerHref ?? null,
    createdAtLabel,
    leadHref: `/leads/${leadId}`,
    editHref: `/leads/${leadId}/edit`,
    newQuoteHref: `/quotes/new?leadId=${encodeURIComponent(leadId)}`,
    progressLabel: progress.label,
    progressDescription: progress.description,
    progressTone: progress.badgeTone,
    progressState: progress.state,
    progressPrimaryAction: serializeProgressAction(progress.primaryAction, {
      leadId,
    }),
    progressSecondaryAction: serializeProgressAction(progress.secondaryAction, {
      leadId,
    }),
    activeQuoteId: progress.activeQuote?.id ?? null,
    activeJobId: progress.activeJob?.id ?? null,
    activeJobStatus: progress.activeJob?.status ?? null,
    visitRequests: visitRequests,
  };

  const surfaceQuotes: LeadWorkSurfaceQuote[] = linkedQuotes.map((q) => ({
    id: q.id,
    title: q.title,
    statusLabel: q.statusLabel,
    statusTone: q.statusTone,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    href: q.href,
  }));

  return (
    <LeadWorkSurface
      mode="compact"
      lead={data}
      linkedQuotes={surfaceQuotes}
      customersForLink={customersForLink}
      activeQuoteWorkSurface={activeQuoteWorkSurface}
      serviceAddressContext={serviceAddressContext}
    />
  );
}
