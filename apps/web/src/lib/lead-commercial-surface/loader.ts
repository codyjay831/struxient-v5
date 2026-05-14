import { db } from "@/lib/db";
import { projectLead, deriveLeadTitle } from "@/lib/lead/lead-projection";
import { jobsiteLineFromLead, isLeadAddressVerified } from "@/lib/jobsite-address";
import { findCustomerMatchHints, LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import { getLeadCommercialProgress, LeadCommercialProgress } from "@/lib/lead-commercial-progress";
import { intakeSnapshotForCustomerFromLead } from "@/lib/customer-service-location-from-lead";
import { RequestContext } from "@/lib/auth-context";
import { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";

import { LeadChannel, LeadStatus } from "@prisma/client";

export interface LeadCommercialSurfacePayload {
  lead: {
    id: string;
    title: string;
    contactName: string;
    email: string;
    phone: string;
    notes: string;
    status: LeadStatus;
    channel: LeadChannel;
    createdAt: Date;
    updatedAt: Date;
    address: unknown;
    signals: unknown;
    jobsiteAddressLine: string;
    isAddressVerified: boolean;
  };
  customer: {
    id: string;
    displayName: string;
    href: string;
  } | null;
  matchHints: LeadCustomerMatchHints | null;
  linkedQuotes: {
    id: string;
    title: string;
    status: string;
    totalCents: number;
    _count: {
      lineItems: number;
    };
  }[];
  progress: LeadCommercialProgress;
  serviceAddressContext: LeadServiceAddressContext;
  visitRequests: any[];
}

const CUSTOMER_LINK_FETCH_CAP = 500;

export async function loadLeadCommercialSurface(
  leadId: string,
  ctx: RequestContext
): Promise<LeadCommercialSurfacePayload | null> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, displayName: true } },
      visitRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) return null;

  const projected = projectLead({
    id: lead.id,
    status: lead.status,
    channel: lead.channel,
    customerId: lead.customerId,
    convertedAt: null,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    contact: lead.contact,
    request: lead.request,
    address: lead.address,
    signals: lead.signals,
  });

  const jobsiteAddressLine = jobsiteLineFromLead({
    address: lead.address,
    signals: lead.signals,
  });

  const linkedQuotes = await db.quote.findMany({
    where: { leadId: lead.id, organizationId: ctx.organizationId },
    orderBy: { updatedAt: "desc" },
    include: {
      job: { select: { id: true, status: true, organizationId: true } },
      _count: { select: { lineItems: true } },
    },
  });

  const hasCustomer = lead.customerId !== null;
  let matchHints = null;

  if (!hasCustomer) {
    const rows = await db.customer.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { displayName: "asc" },
      take: CUSTOMER_LINK_FETCH_CAP,
      select: { id: true, displayName: true, email: true, phone: true, companyName: true },
    });

    matchHints = findCustomerMatchHints(
      rows,
      projected.email,
      projected.phone,
      CUSTOMER_LINK_FETCH_CAP
    );
  }

  const progress = getLeadCommercialProgress({
    lead: {
      status: lead.status,
      customerId: lead.customerId,
      contactName: projected.contactName,
      companyName: projected.companyName,
      email: projected.email,
      phone: projected.phone,
      jobsiteAddressLine,
      isAddressVerified: isLeadAddressVerified(lead),
    },
    quotes: linkedQuotes.map((q) => ({
      id: q.id,
      title: q.title,
      status: q.status,
      totalCents: q.totalCents,
      lineItemCount: q._count.lineItems,
      updatedAt: q.updatedAt,
      job: q.job && q.job.organizationId === ctx.organizationId ? { id: q.job.id, status: q.job.status } : null,
    })),
    hasExistingCustomerMatch: matchHints?.kind === "checked" && matchHints.matches.length > 0,
  });

  const intakeSnapshot = intakeSnapshotForCustomerFromLead({
    address: lead.address,
    signals: lead.signals,
  });

  const intakeForBlock = intakeSnapshot
    ? {
        defaultDisplayAddress:
          intakeSnapshot.formattedAddress.trim() ||
          intakeSnapshot.addressLine1.trim(),
        structuredJson: JSON.stringify(intakeSnapshot),
      }
    : { defaultDisplayAddress: "", structuredJson: "" };

  let serviceAddressContext: LeadServiceAddressContext;
  if (lead.customerId) {
    const customerLocations = await db.customerServiceLocation.findMany({
      where: { customerId: lead.customerId, organizationId: ctx.organizationId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      include: {
        createdFromLead: { select: { id: true, contact: true, request: true, channel: true } },
      },
    });
    serviceAddressContext = {
      customer: {
        customerId: lead.customerId,
        customerHref: `/customers/${lead.customerId}`,
        serviceLocations: customerLocations.map((loc) => ({
          ...loc,
          createdFromLead: loc.createdFromLead
            ? {
                id: loc.createdFromLead.id,
                title: deriveLeadTitle(loc.createdFromLead.contact, loc.createdFromLead.request),
                channel: loc.createdFromLead.channel,
                source: loc.createdFromLead.channel,
              }
            : null,
        })),
      },
      intake: intakeForBlock,
    };
  } else {
    serviceAddressContext = { customer: null, intake: intakeForBlock };
  }

  return {
    lead: {
      id: lead.id,
      title: projected.title,
      contactName: projected.contactName || "",
      email: projected.email || "",
      phone: projected.phone || "",
      notes: projected.notes || "",
      status: lead.status,
      channel: lead.channel,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      address: lead.address,
      signals: lead.signals,
      jobsiteAddressLine: jobsiteAddressLine || "",
      isAddressVerified: isLeadAddressVerified(lead),
    },
    customer: lead.customer ? {
      id: lead.customer.id,
      displayName: lead.customer.displayName,
      href: `/customers/${lead.customer.id}`,
    } : null,
    matchHints,
    linkedQuotes,
    progress,
    serviceAddressContext,
    visitRequests: lead.visitRequests,
  };
}
