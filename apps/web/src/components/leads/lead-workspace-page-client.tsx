"use client";

/**
 * LeadWorkspacePageClient — client component for the full Lead record page.
 *
 * The body is now rendered by `LeadWorkSurface(mode="full")` so the full page
 * shares the canonical Lead UX with the popup and Workstation drawer.
 *
 * The shell still renders breadcrumb + identity header outside this component;
 * the surface itself owns the tabs (Overview / Contact / Activity / Quote) and
 * the Next-step CTA card.
 */

import type { StatusBadgeTone } from "@/components/ui/status-badge";
import {
  LeadWorkSurface,
  type LeadWorkSurfaceActiveQuotePayload,
  type LeadWorkSurfaceData,
  type LeadWorkSurfaceProgressAction,
  type LeadWorkSurfaceQuote,
} from "@/components/work-surfaces/lead-work-surface";
import type { LeadFormState } from "@/app/(workspace)/leads/lead-form-actions";
import type { LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import type { LeadStatus } from "@prisma/client";

/* ─── Serialized types (computed server-side, passed as plain props) ─────── */

export type SerializedProgressActionFull = LeadWorkSurfaceProgressAction;

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

export type SerializedLeadFull = {
  id: string;
  title: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  publicIntakeFormattedAddress: string | null;
  intakeServiceLocationLinkedToCustomer: boolean;
  sourceLabel: string;
  sourceDetail: string | null;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  /** Raw LeadStatus string — passed to LeadStatusForm for the select default. */
  statusValue: LeadStatus;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  updatedAtLabel: string;
  convertedAtLabel: string | null;
  showConvertedWithoutCustomerHelper: boolean;
  leadHref: string;
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
};

/* ─── Adapter: SerializedLeadFull → LeadWorkSurface props ────────────────── */

function adaptLeadFull(
  lead: SerializedLeadFull,
  linkedQuotes: SerializedLinkedQuoteFull[],
): { data: LeadWorkSurfaceData; linkedQuotes: LeadWorkSurfaceQuote[] } {
  const surfaceQuotes: LeadWorkSurfaceQuote[] = linkedQuotes.map((q) => ({
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

  const data: LeadWorkSurfaceData = {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    publicIntakeFormattedAddress: lead.publicIntakeFormattedAddress,
    intakeServiceLocationLinkedToCustomer: lead.intakeServiceLocationLinkedToCustomer,
    sourceLabel: lead.sourceLabel,
    sourceDetail: lead.sourceDetail,
    statusLabel: lead.statusLabel,
    statusTone: lead.statusTone,
    statusValue: lead.statusValue,
    customerId: lead.customerId,
    customerDisplayName: lead.customerDisplayName,
    customerHref: lead.customerHref,
    createdAtLabel: lead.createdAtLabel,
    updatedAtLabel: lead.updatedAtLabel,
    convertedAtLabel: lead.convertedAtLabel,
    showConvertedWithoutCustomerHelper: lead.showConvertedWithoutCustomerHelper,
    leadHref: lead.leadHref,
    editHref: lead.editHref,
    newQuoteHref: lead.newQuoteHref,
    progressLabel: lead.progressLabel,
    progressDescription: lead.progressDescription,
    progressTone: lead.progressTone,
    progressState: lead.progressState,
    progressPrimaryAction: lead.progressPrimaryAction,
    progressSecondaryAction: lead.progressSecondaryAction,
    activeQuoteId: lead.activeQuoteId,
    activeQuoteTitle: lead.activeQuoteTitle,
    activeQuoteStatusLabel: lead.activeQuoteStatusLabel,
    activeQuoteTone: lead.activeQuoteTone,
    activeQuoteTotalCents: lead.activeQuoteTotalCents,
    activeQuoteLineItemCount: lead.activeQuoteLineItemCount,
    activeJobId: lead.activeJobId,
    activeJobStatus: lead.activeJobStatus,
    showsRevisionDrift: lead.showsRevisionDrift,
  };

  return { data, linkedQuotes: surfaceQuotes };
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function LeadWorkspacePageClient({
  lead,
  linkedQuotes,
  updateStatusAction,
  customersForLink,
  linkLeadAction,
  matchHints,
  activeQuoteWorkSurface,
}: {
  lead: SerializedLeadFull;
  linkedQuotes: SerializedLinkedQuoteFull[];
  updateStatusAction: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  customersForLink?: { id: string; displayName: string }[];
  linkLeadAction?: (
    prevState: LeadFormState,
    formData: FormData,
  ) => Promise<LeadFormState>;
  matchHints?: LeadCustomerMatchHints;
  activeQuoteWorkSurface?: LeadWorkSurfaceActiveQuotePayload | null;
}) {
  const { data, linkedQuotes: surfaceQuotes } = adaptLeadFull(lead, linkedQuotes);

  return (
    <LeadWorkSurface
      mode="full"
      lead={data}
      linkedQuotes={surfaceQuotes}
      customersForLink={customersForLink}
      matchHints={matchHints}
      updateStatusAction={updateStatusAction}
      linkLeadAction={linkLeadAction}
      activeQuoteWorkSurface={activeQuoteWorkSurface}
    />
  );
}
