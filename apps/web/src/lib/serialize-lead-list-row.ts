import { formatCompactAge } from "@/lib/compact-age";
import { jobsiteLineFromLead, isLeadAddressQuoteReady } from "@/lib/jobsite-address";
import {
  evaluateCustomerMatchGate,
  hasBlockingCustomerMatch,
  type CustomerMatchRow,
} from "@/lib/lead-customer-match-gate";
import {
  getOpportunityFlow,
  resolveOpportunityActionHref,
  type OpportunityAction,
  type OpportunityFlowView,
} from "@/lib/opportunity-flow";
import { opportunityActionOpensQuoteTab } from "@/lib/opportunity-tab-routing";
import {
  formatLeadChannel,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { readSignals } from "@/lib/lead/lead-projection";
import { toOpportunityFlowVisitInput } from "@/lib/scheduling/serialize-lead-visit-request";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import type { LeadChannel, LeadStatus, QuoteStatus, JobStatus, Prisma } from "@prisma/client";

export type SerializedProgressAction = LeadWorkSurfaceProgressAction;

export type SerializedQuoteSummary = {
  id: string;
  title: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  totalCents: number;
  lineItemCount: number;
  href: string;
};

export type SerializedLeadRow = {
  id: string;
  title: string;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  source: LeadChannel;
  sourceLabel: string;
  statusLabel: string;
  statusTone: StatusBadgeTone;
  customerId: string | null;
  customerDisplayName: string | null;
  customerHref: string | null;
  createdAtLabel: string;
  /** Server-rendered staleness hint, e.g. `Age 2D 3H`. */
  ageLabel: string;
  /** Optional value hint, e.g. `$1,200`. */
  valueLabel?: string | null;
  progressLabel: string;
  progressDescription: string;
  progressTone: StatusBadgeTone;
  progressState: string;
  progressPrimaryAction: SerializedProgressAction | null;
  progressSecondaryAction: SerializedProgressAction | null;
  opportunityFlow: OpportunityFlowView;
  nextStepLabel: string | null;
  satisfiedItems: string[];
  requiredItems: string[];
  activeJobId: string | null;
  activeJobStatus: string | null;
  /** Non-archived quotes, newest first. */
  quotes: SerializedQuoteSummary[];
  /** /leads/[id] */
  leadHref: string;
  /** Canonical lead handoff URL (starts quote from Lead Review). */
  newQuoteHref: string;
  /** Jobsite / project address when known from this lead. */
  jobsiteAddressLine: string | null;
};

/**
 * Input shape for the serialization function. Mirrors the `include` used in
 * Leads list and Inbox queries.
 */
export type LeadWithRelations = {
  id: string;
  title: string;
  status: LeadStatus;
  followUpAt: Date | null;
  channel: LeadChannel;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  signals: Prisma.JsonValue;
  address: Prisma.JsonValue;
  createdAt: Date;
  customerId: string | null;
  customer: { id: string; displayName: string } | null;
  quotes: {
    id: string;
    title: string;
    status: QuoteStatus;
    totalCents: number;
    createdAt: Date;
    updatedAt: Date;
    revisionOfQuoteId: string | null;
    revisionNumber: number;
    checkpoints: { kind: "SEND" | "APPROVAL"; createdAt: Date }[];
    changeRequests: {
      id: string;
      message: string;
      createdAt: Date;
      resolvedAt: Date | null;
      requiresVisit: boolean;
      resultingQuoteId: string | null;
    }[];
    _count: { lineItems: number };
    job: { id: string; status: JobStatus; organizationId: string } | null;
  }[];
  visitRequests?: {
    id: string;
    status: "PENDING" | "CONFIRMED" | "CANCELED" | "COMPLETED" | "NO_SHOW";
    requestedDate: Date | null;
    requestedWindow: string | null;
    confirmedDate: Date | null;
    completedAt: Date | null;
    createdAt: Date;
  }[];
};

type LeadWorkSurfaceProgressAction = {
  href: string;
  label: string;
  opensQuoteTab: boolean;
  opensContactTab: boolean;
};

function serializeOpportunityAction(
  action: OpportunityAction | null,
  ctx: { leadId: string },
): LeadWorkSurfaceProgressAction | null {
  if (!action) return null;
  const opensQuoteTab = opportunityActionOpensQuoteTab(action.kind);
  const opensContactTab =
    action.kind === "EDIT_CONTACT_INFO" || action.kind === "REVIEW_CUSTOMER_MATCH";
  return {
    href: resolveOpportunityActionHref(action, ctx),
    label: action.label,
    opensQuoteTab,
    opensContactTab,
  };
}

export function serializeLeadListRow(
  lead: LeadWithRelations,
  organizationId: string,
  now: Date = new Date(),
  customerPrimaryLocation?: { googlePlaceId: string } | null,
  orgCustomersForMatch?: CustomerMatchRow[],
): SerializedLeadRow {
  const flowQuoteInputs = lead.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    lineItemCount: q._count.lineItems,
    totalCents: q.totalCents,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    revisionOfQuoteId: q.revisionOfQuoteId,
    revisionNumber: q.revisionNumber,
    latestSendAt: q.checkpoints.find((c) => c.kind === "SEND")?.createdAt ?? null,
    latestApprovalAt: q.checkpoints.find((c) => c.kind === "APPROVAL")?.createdAt ?? null,
    job:
      q.job && q.job.organizationId === organizationId
        ? { id: q.job.id, status: q.job.status }
        : null,
  }));

  const jobsiteAddressLine = jobsiteLineFromLead(lead);

  const matchHints =
    orgCustomersForMatch != null
      ? evaluateCustomerMatchGate({
          customerId: lead.customerId,
          email: lead.email,
          phone: lead.phone,
          orgCustomers: orgCustomersForMatch,
        })
      : null;
  const hasExistingCustomerMatch =
    matchHints != null && hasBlockingCustomerMatch(matchHints);

  const opportunityFlow = getOpportunityFlow({
    lead: {
      id: lead.id,
      status: lead.status,
      followUpAt: lead.followUpAt,
      customerId: lead.customerId,
      contactName: lead.contactName,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      jobsiteAddressLine,
      isAddressVerified: isLeadAddressQuoteReady(lead, customerPrimaryLocation),
    },
    quotes: flowQuoteInputs,
    visits: (lead.visitRequests ?? []).map((visit) => toOpportunityFlowVisitInput(visit)),
    changeRequests: lead.quotes.flatMap((quote) =>
      quote.changeRequests.map((request) => ({
        id: request.id,
        quoteId: quote.id,
        message: request.message,
        createdAt: request.createdAt,
        resolvedAt: request.resolvedAt,
        requiresVisit: request.requiresVisit,
        resultingQuoteId: request.resultingQuoteId,
      })),
    ),
    hasExistingCustomerMatch,
    now,
  });

  const signals = readSignals(lead.signals);
  const activeQuote = flowQuoteInputs.find((q) => q.id === opportunityFlow.primaryAction?.targetQuoteId);
  const quoteValueLabel =
    activeQuote && activeQuote.totalCents > 0
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(activeQuote.totalCents / 100)
      : null;

  return {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    notes: typeof signals.notes === "string" ? signals.notes : null,
    source: lead.channel,
    sourceLabel: formatLeadChannel(lead.channel),
    statusLabel: formatLeadStatus(lead.status),
    statusTone: leadStatusBadgeTone(lead.status),
    customerId: lead.customerId,
    customerDisplayName: lead.customer?.displayName ?? null,
    customerHref: lead.customer ? `/customers/${lead.customer.id}` : null,
    createdAtLabel: lead.createdAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    ageLabel: `Age ${formatCompactAge(lead.createdAt, now)}`,
    valueLabel: quoteValueLabel,
    progressLabel: opportunityFlow.conditionLabel,
    progressDescription: opportunityFlow.summary,
    progressTone:
      opportunityFlow.phase === "WON"
        ? "approved"
        : opportunityFlow.phase === "CUSTOMER_REVIEW"
          ? "sent"
          : opportunityFlow.phase === "LOST"
            ? "neutral"
            : opportunityFlow.phase === "PAUSED"
              ? "warning"
              : "draft",
    progressState: opportunityFlow.conditionCode,
    progressPrimaryAction: serializeOpportunityAction(opportunityFlow.primaryAction, {
      leadId: lead.id,
    }),
    progressSecondaryAction: serializeOpportunityAction(opportunityFlow.secondaryActions[0] ?? null, {
      leadId: lead.id,
    }),
    nextStepLabel: opportunityFlow.primaryAction?.label ?? null,
    satisfiedItems: opportunityFlow.satisfiedItems,
    requiredItems: opportunityFlow.requirements,
    activeJobId: opportunityFlow.primaryAction?.targetJobId ?? null,
    activeJobStatus: opportunityFlow.conditionCode === "JOB_ACTIVE" ? "ACTIVE" : null,
    opportunityFlow,
    quotes: lead.quotes
      .filter((q) => q.status !== "ARCHIVED")
      .map((q) => ({
        id: q.id,
        title: q.title,
        statusLabel: formatQuoteStatus(q.status),
        statusTone: quoteStatusBadgeTone(q.status),
        totalCents: q.totalCents,
        lineItemCount: q._count.lineItems,
        href: `/leads/${lead.id}?tab=quote`,
      })),
    leadHref: `/leads/${lead.id}`,
    newQuoteHref: `/leads/${lead.id}?tab=quote`,
    jobsiteAddressLine: jobsiteLineFromLead(lead),
  };
}
