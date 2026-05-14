import { formatCompactAge } from "@/lib/compact-age";
import { jobsiteLineFromLead, isLeadAddressVerified } from "@/lib/jobsite-address";
import {
  getLeadCommercialProgress,
  serializeLeadProgressAction,
  type LeadWorkSurfaceProgressAction,
} from "@/lib/lead-commercial-progress";
import {
  formatLeadChannel,
  formatLeadStatus,
  leadStatusBadgeTone,
} from "@/lib/lead-display";
import { formatQuoteStatus, quoteStatusBadgeTone } from "@/lib/quote-display";
import { readSignals } from "@/lib/lead/lead-projection";
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
  satisfiedItems: string[];
  requiredItems: string[];
  activeJobId: string | null;
  activeJobStatus: string | null;
  /** Non-archived quotes, newest first. */
  quotes: SerializedQuoteSummary[];
  /** /leads/[id] */
  leadHref: string;
  /** /quotes/new?leadId=[id] */
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
    updatedAt: Date;
    _count: { lineItems: number };
    job: { id: string; status: JobStatus; organizationId: string } | null;
  }[];
};

export function serializeLeadListRow(
  lead: LeadWithRelations,
  organizationId: string,
  now: Date = new Date(),
): SerializedLeadRow {
  const progressQuoteInputs = lead.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    totalCents: q.totalCents,
    lineItemCount: q._count.lineItems,
    updatedAt: q.updatedAt,
    job:
      q.job && q.job.organizationId === organizationId
        ? { id: q.job.id, status: q.job.status }
        : null,
  }));

  const jobsiteAddressLine = jobsiteLineFromLead(lead);

  const progress = getLeadCommercialProgress({
    lead: {
      status: lead.status,
      customerId: lead.customerId,
      contactName: lead.contactName,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      jobsiteAddressLine,
      isAddressVerified: isLeadAddressVerified(lead),
    },
    quotes: progressQuoteInputs,
  });

  const signals = readSignals(lead.signals);

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
    progressLabel: progress.label,
    progressDescription: progress.description,
    progressTone: progress.badgeTone,
    progressState: progress.state,
    progressPrimaryAction: serializeLeadProgressAction(progress.primaryAction, {
      leadId: lead.id,
    }),
    progressSecondaryAction: serializeLeadProgressAction(progress.secondaryAction, {
      leadId: lead.id,
    }),
    satisfiedItems: progress.satisfiedItems,
    requiredItems: progress.requiredItems,
    activeJobId: progress.activeJob?.id ?? null,
    activeJobStatus: progress.activeJob?.status ?? null,
    quotes: lead.quotes
      .filter((q) => q.status !== "ARCHIVED")
      .map((q) => ({
        id: q.id,
        title: q.title,
        statusLabel: formatQuoteStatus(q.status),
        statusTone: quoteStatusBadgeTone(q.status),
        totalCents: q.totalCents,
        lineItemCount: q._count.lineItems,
        href: `/quotes/${q.id}`,
      })),
    leadHref: `/leads/${lead.id}`,
    newQuoteHref: `/quotes/new?leadId=${encodeURIComponent(lead.id)}`,
    jobsiteAddressLine: jobsiteLineFromLead(lead),
  };
}
