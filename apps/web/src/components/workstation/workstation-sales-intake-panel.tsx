"use client";

/**
 * WorkstationSalesIntakePanel — thin loader-and-bindings wrapper around
 * `SalesIntakeWorkSurface(mode="compact")`. Workstation now hosts the same Sales Intake UX as
 * the Sales Intakes popup and Sales Intake full page; this file only adapts the inputs.
 */

import {
  SalesIntakeWorkSurface,
  type SalesIntakeWorkSurfaceActiveQuotePayload,
  type SalesIntakeWorkSurfaceData,
  type SalesIntakeWorkSurfaceProgressAction,
  type SalesIntakeWorkSurfaceQuote,
  type SalesIntakeWorkSurfaceVisitRequest,
} from "@/components/work-surfaces/sales-intake-work-surface";
import {
  type SalesIntakeCommercialProgress,
  type SalesIntakeCommercialProgressAction,
  resolveSalesIntakeCommercialProgressActionHref,
} from "@/lib/sales-commercial-progress";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import type { SalesIntakeStatus, SalesIntakeSource } from "@prisma/client";
import type { SalesIntakeServiceAddressContext } from "@/app/(workspace)/sales/sales-workspace-actions";

export type WorkstationSalesIntakePanelQuote = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

export type WorkstationSalesIntakePanelProps = {
  salesIntakeId: string;
  salesIntakeTitle: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes: string | null;
  /** Manual `SalesIntakeStatus` enum value (not the derived progress state). */
  statusValue: SalesIntakeStatus;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  sourceLabel: string;
  source: SalesIntakeSource;
  createdAtLabel: string;
  customerId: string | null;
  customerDisplayName?: string | null;
  customerHref?: string | null;
  /** Org-scoped customers for optional "link existing"; omitted when sales intake already has a customer. */
  customersForLink?: { id: string; displayName: string }[];
  /** Non-archived linked quotes, newest first. */
  linkedQuotes: WorkstationSalesIntakePanelQuote[];
  progress: SalesIntakeCommercialProgress;
  /** Pre-loaded active-quote QuoteWorkSurface payload (Phase 2 embed). */
  activeQuoteWorkSurface?: SalesIntakeWorkSurfaceActiveQuotePayload | null;
  /** Same resolution as Sales Intakes list / full sales intake page (intake + legacy notes). */
  jobsiteAddressLine?: string | null;
  /** Pre-loaded service-address context for the Customer Info block. */
  serviceAddressContext?: SalesIntakeServiceAddressContext;
  /** Site visit requests (Phase C). */
  visitRequests?: SalesIntakeWorkSurfaceVisitRequest[];
};

function serializeProgressAction(
  action: SalesIntakeCommercialProgressAction | null,
  ctx: { salesIntakeId: string },
): SalesIntakeWorkSurfaceProgressAction | null {
  if (!action) return null;
  const href = resolveSalesIntakeCommercialProgressActionHref(action, ctx);
  const opensQuoteTab =
    action.kind === "OPEN_DRAFT_QUOTE" ||
    action.kind === "OPEN_QUOTE" ||
    action.kind === "START_QUOTE";
  const opensContactTab =
    action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
    action.kind === "EDIT_CONTACT_INFO";
  return { href, label: action.label, opensQuoteTab, opensContactTab };
}

export function WorkstationSalesIntakePanel({
  salesIntakeId,
  salesIntakeTitle,
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
}: WorkstationSalesIntakePanelProps) {
  const data: SalesIntakeWorkSurfaceData = {
    id: salesIntakeId,
    title: salesIntakeTitle,
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
    salesIntakeHref: `/sales/${salesIntakeId}`,
    editHref: `/sales/${salesIntakeId}/edit`,
    newQuoteHref: `/quotes/new?salesIntakeId=${encodeURIComponent(salesIntakeId)}`,
    progressLabel: progress.label,
    progressDescription: progress.description,
    progressTone: progress.badgeTone,
    progressState: progress.state,
    progressPrimaryAction: serializeProgressAction(progress.primaryAction, {
      salesIntakeId,
    }),
    progressSecondaryAction: serializeProgressAction(progress.secondaryAction, {
      salesIntakeId,
    }),
    activeQuoteId: progress.activeQuote?.id ?? null,
    activeJobId: progress.activeJob?.id ?? null,
    activeJobStatus: progress.activeJob?.status ?? null,
    visitRequests: visitRequests,
  };

  const surfaceQuotes: SalesIntakeWorkSurfaceQuote[] = linkedQuotes.map((q) => ({
    id: q.id,
    title: q.title,
    statusLabel: q.statusLabel,
    statusTone: q.statusTone,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    href: q.href,
  }));

  return (
    <SalesIntakeWorkSurface
      mode="compact"
      salesIntake={data}
      linkedQuotes={surfaceQuotes}
      customersForLink={customersForLink}
      activeQuoteWorkSurface={activeQuoteWorkSurface}
      serviceAddressContext={serviceAddressContext}
    />
  );
}
