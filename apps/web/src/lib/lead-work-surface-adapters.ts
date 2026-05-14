import type {
  LeadWorkSurfaceData,
  LeadWorkSurfaceQuote,
} from "@/components/work-surfaces/lead-work-surface";
import type { SerializedLeadRow } from "@/lib/serialize-lead-list-row";

/**
 * Adapts a serialized lead row (used in lists/inbox) into the unified
 * LeadWorkSurface props.
 */
export function adaptLeadRow(lead: SerializedLeadRow): {
  data: LeadWorkSurfaceData;
  linkedQuotes: LeadWorkSurfaceQuote[];
} {
  const linkedQuotes: LeadWorkSurfaceQuote[] = lead.quotes.map((q) => ({
    id: q.id,
    title: q.title,
    statusLabel: q.statusLabel,
    statusTone: q.statusTone,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    href: q.href,
  }));

  const data: LeadWorkSurfaceData = {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    source: lead.source,
    sourceLabel: lead.sourceLabel,
    statusLabel: lead.statusLabel,
    statusTone: lead.statusTone,
    customerId: lead.customerId,
    customerDisplayName: lead.customerDisplayName,
    customerHref: lead.customerHref,
    createdAtLabel: lead.createdAtLabel,
    leadHref: lead.leadHref,
    editHref: `${lead.leadHref}/edit`,
    newQuoteHref: lead.newQuoteHref,
    progressLabel: lead.progressLabel,
    progressDescription: lead.progressDescription,
    progressTone: lead.progressTone,
    progressState: lead.progressState,
    progressPrimaryAction: lead.progressPrimaryAction,
    progressSecondaryAction: lead.progressSecondaryAction,
    activeQuoteId: lead.quotes[0]?.id ?? null,
    activeJobId: lead.activeJobId,
    activeJobStatus: lead.activeJobStatus,
    jobsiteAddressLine: lead.jobsiteAddressLine,
  };

  return { data, linkedQuotes };
}
