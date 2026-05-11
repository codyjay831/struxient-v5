"use client";

/**
 * SalesWorkspacePageClient — client component for the full Sales Intake record page.
 *
 * The body is now rendered by `SalesIntakeWorkSurface(mode="full")` so the full page
 * shares the canonical Sales Intake UX with the popup and Workstation drawer.
 *
 * The shell still renders breadcrumb + identity header outside this component;
 * the surface itself owns the tabs (Overview / Contact / Activity / Quote) and
 * the Next-step CTA card.
 */

import type { StatusBadgeTone } from "@/components/ui/status-badge";
import {
  SalesIntakeWorkSurface,
  type SalesIntakeWorkSurfaceActiveQuotePayload,
  type SalesIntakeWorkSurfaceData,
  type SalesIntakeWorkSurfaceProgressAction,
  type SalesIntakeWorkSurfaceQuote,
  type SalesIntakeWorkSurfaceVisitRequest,
} from "@/components/work-surfaces/sales-intake-work-surface";
import type { SalesIntakeFormState } from "@/app/(workspace)/sales/sales-form-actions";
import type { SalesIntakeCustomerMatchHints } from "@/lib/sales-intake-customer-match-hints";
import type { SalesIntakeStatus, SalesIntakeSource, NeededByBucket } from "@prisma/client";
import type { SalesIntakeServiceAddressContext } from "@/app/(workspace)/sales/sales-workspace-actions";

/* ─── Serialized types (computed server-side, passed as plain props) ─────── */

export type SerializedProgressActionFull = SalesIntakeWorkSurfaceProgressAction;

export type SerializedLinkedQuoteFull = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  updatedAtLabel: string;
  href: string;
  executionReviewHref: string;
  isDraft: boolean;
  isSent: boolean;
  isApproved: boolean;
};

export type SerializedSalesIntakeFull = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  requestType: string | null;
  neededByBucket: NeededByBucket | null;
  neededByDateLabel: string | null;
  scopeSummary: string | null;
  jobsiteAddressLine: string | null;
  intakeServiceLocationLinkedToCustomer: boolean;
  sourceLabel: string;
  sourceDetail: string | null;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  /** Raw SalesIntakeStatus string — passed to SalesIntakeStatusForm for the select default. */
  statusValue: SalesIntakeStatus;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  updatedAtLabel: string;
  convertedAtLabel: string | null;
  showConvertedWithoutCustomerHelper: boolean;
  salesIntakeHref: string;
  editHref: string;
  newQuoteHref: string;
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: SerializedProgressActionFull | null;
  progressSecondaryAction: SerializedProgressActionFull | null;
  progressStepIndex: number;
  progressTotalSteps: number;
  progressIsTerminal: boolean;
  activeQuoteId: string | null;
  activeQuoteTitle: string | null;
  activeQuoteStatusLabel: string | null;
  activeQuoteTone: StatusBadgeTone | null;
  activeQuoteTotalCents: number | null;
  activeQuoteLineItemCount: number | null;
  activeJobId: string | null;
  activeJobStatus: string | null;
  showsRevisionDrift: boolean;
  /** Canonical sales intake source — used for customer-from-sales-intake note shaping in workspace UI. */
  source: SalesIntakeSource;
  /** Site visit requests (Phase C). */
  visitRequests?: SalesIntakeWorkSurfaceVisitRequest[];
};

/* ─── Adapter: SerializedSalesIntakeFull → SalesIntakeWorkSurface props ────────────────── */

function adaptSalesFull(
  salesIntake: SerializedSalesIntakeFull,
  linkedQuotes: SerializedLinkedQuoteFull[],
): { data: SalesIntakeWorkSurfaceData; linkedQuotes: SalesIntakeWorkSurfaceQuote[] } {
  const surfaceQuotes: SalesIntakeWorkSurfaceQuote[] = linkedQuotes.map((q) => ({
    id: q.id,
    title: q.title,
    statusLabel: q.statusLabel,
    statusTone: q.statusTone,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    href: q.href,
    updatedAtLabel: q.updatedAtLabel,
    executionReviewHref: q.executionReviewHref,
    isDraft: q.isDraft,
    isSent: q.isSent,
    isApproved: q.isApproved,
  }));

  const data: SalesIntakeWorkSurfaceData = {
    id: salesIntake.id,
    title: salesIntake.title,
    contactName: salesIntake.contactName,
    email: salesIntake.email,
    phone: salesIntake.phone,
    notes: salesIntake.notes,
    requestType: salesIntake.requestType,
    neededByBucket: salesIntake.neededByBucket,
    neededByDateLabel: salesIntake.neededByDateLabel,
    scopeSummary: salesIntake.scopeSummary,
    jobsiteAddressLine: salesIntake.jobsiteAddressLine,
    intakeServiceLocationLinkedToCustomer: salesIntake.intakeServiceLocationLinkedToCustomer,
    sourceLabel: salesIntake.sourceLabel,
    sourceDetail: salesIntake.sourceDetail,
    statusLabel: salesIntake.statusLabel,
    statusTone: salesIntake.statusTone,
    statusValue: salesIntake.statusValue,
    customerId: salesIntake.customerId,
    customerDisplayName: salesIntake.customerDisplayName,
    customerHref: salesIntake.customerHref,
    createdAtLabel: salesIntake.createdAtLabel,
    updatedAtLabel: salesIntake.updatedAtLabel,
    convertedAtLabel: salesIntake.convertedAtLabel,
    showConvertedWithoutCustomerHelper: salesIntake.showConvertedWithoutCustomerHelper,
    salesIntakeHref: salesIntake.salesIntakeHref,
    editHref: salesIntake.editHref,
    newQuoteHref: salesIntake.newQuoteHref,
    progressLabel: salesIntake.progressLabel,
    progressDescription: salesIntake.progressDescription,
    progressTone: salesIntake.progressTone,
    progressState: salesIntake.progressState,
    progressPrimaryAction: salesIntake.progressPrimaryAction,
    progressSecondaryAction: salesIntake.progressSecondaryAction,
    activeQuoteId: salesIntake.activeQuoteId,
    activeQuoteTitle: salesIntake.activeQuoteTitle,
    activeQuoteStatusLabel: salesIntake.activeQuoteStatusLabel,
    activeQuoteTone: salesIntake.activeQuoteTone,
    activeQuoteTotalCents: salesIntake.activeQuoteTotalCents,
    activeQuoteLineItemCount: salesIntake.activeQuoteLineItemCount,
    activeJobId: salesIntake.activeJobId,
    activeJobStatus: salesIntake.activeJobStatus,
    showsRevisionDrift: salesIntake.showsRevisionDrift,
    source: salesIntake.source,
    visitRequests: salesIntake.visitRequests,
  };

  return { data, linkedQuotes: surfaceQuotes };
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function SalesWorkspacePageClient({
  salesIntake,
  linkedQuotes,
  updateStatusAction,
  customersForLink,
  linkSalesIntakeAction,
  matchHints,
  activeQuoteWorkSurface,
  serviceAddressContext,
}: {
  salesIntake: SerializedSalesIntakeFull;
  linkedQuotes: SerializedLinkedQuoteFull[];
  updateStatusAction: (
    prevState: SalesIntakeFormState,
    formData: FormData,
  ) => Promise<SalesIntakeFormState>;
  customersForLink?: { id: string; displayName: string }[];
  linkSalesIntakeAction?: (
    prevState: SalesIntakeFormState,
    formData: FormData,
  ) => Promise<SalesIntakeFormState>;
  matchHints?: SalesIntakeCustomerMatchHints;
  activeQuoteWorkSurface?: SalesIntakeWorkSurfaceActiveQuotePayload | null;
  serviceAddressContext?: SalesIntakeServiceAddressContext;
}) {
  const { data, linkedQuotes: surfaceQuotes } = adaptSalesFull(salesIntake, linkedQuotes);

  return (
    <SalesIntakeWorkSurface
      mode="full"
      salesIntake={data}
      linkedQuotes={surfaceQuotes}
      customersForLink={customersForLink}
      matchHints={matchHints}
      updateStatusAction={updateStatusAction}
      linkSalesIntakeAction={linkSalesIntakeAction}
      activeQuoteWorkSurface={activeQuoteWorkSurface}
      serviceAddressContext={serviceAddressContext}
    />
  );
}
