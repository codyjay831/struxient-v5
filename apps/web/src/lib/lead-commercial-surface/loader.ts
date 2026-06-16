import { db } from "@/lib/db";
import { projectLead, deriveLeadTitle } from "@/lib/lead/lead-projection";
import { jobsiteLineFromLead, isLeadAddressQuoteReady, isLeadAddressVerified } from "@/lib/jobsite-address";
import { findCustomerMatchHints, LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import { getLeadCommercialProgress, LeadCommercialProgress } from "@/lib/lead-commercial-progress";
import { intakeSnapshotForCustomerFromLead } from "@/lib/customer-service-location-from-lead";
import { RequestContext } from "@/lib/auth-context";
import { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";
import {
  buildLeadReviewViewModel,
  leadReviewFactsFromLeadJson,
  type LeadReviewViewModel,
} from "@/lib/lead-review-view-model";
import { readRequest } from "@/lib/lead/lead-projection";
import {
  buildLeadIntakeProjection,
  type LeadIntakeProjection,
} from "@/lib/lead-intake-projection";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";
import { resolveSiteDetailsForServiceLocation } from "@/lib/site-details/resolver";

import { AttachmentStatus, LeadChannel, LeadCloseReason, LeadStatus, NeededByBucket } from "@prisma/client";

const CUSTOMER_LINK_FETCH_CAP = 500;
const LEAD_ATTACHMENT_CAP = 20;
const LEAD_EVENT_CAP = 30;

export interface LeadCommercialSurfacePayload {
  lead: {
    id: string;
    title: string;
    contactName: string;
    email: string;
    phone: string;
    notes: string;
    companyName: string;
    status: LeadStatus;
    closeReason: LeadCloseReason | null;
    channel: LeadChannel;
    followUpAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    address: unknown;
    signals: unknown;
    jobsiteAddressLine: string;
    isAddressVerified: boolean;
    isAddressQuoteReady: boolean;
    requestType: string | null;
    scopeSummary: string | null;
    neededByBucket: NeededByBucket | null;
    neededByDate: Date | null;
    serviceLocationId: string | null;
    siteDetails: {
      apn: string | null;
      apnSourceTitle?: string | null;
      apnSourceUrl?: string | null;
      apnVerificationUrl?: string | null;
      apnConflict?: {
        value: string;
        sourceTitle: string | null;
        sourceUrl: string | null;
      } | null;
      utilityName: string | null;
      utilityOfficialWebsite?: string | null;
      utilityServiceUpgradeUrl?: string | null;
      utilityCoverageSourceTitle?: string | null;
      utilityCoverageSourceUrl?: string | null;
      jurisdictionName: string | null;
      jurisdictionBuildingDepartmentName?: string | null;
      jurisdictionOfficialWebsite?: string | null;
      jurisdictionBuildingDepartmentUrl?: string | null;
      jurisdictionPermitPortalUrl?: string | null;
      jurisdictionFormsUrl?: string | null;
      jurisdictionInspectionsUrl?: string | null;
      assessorCounty?: string | null;
      assessorState?: string | null;
      assessorSearchUrl?: string | null;
      assessorParcelGisUrl?: string | null;
      detailsStatus:
        | "DATABASE_MATCH"
        | "AI_FOUND"
        | "USER_REVIEWED"
        | "USER_CORRECTED"
        | "UNVERIFIED"
        | "CONFLICT"
        | "STALE";
      missingScopes: string[];
    } | null;
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
  visitRequests: LeadVisitRequestPayload[];
  reviewViewModel: LeadReviewViewModel;
  /** Derived DTO for future AI prompts — not persisted. */
  intakeProjection: LeadIntakeProjection;
}

export async function loadLeadCommercialSurface(
  leadId: string,
  ctx: RequestContext
): Promise<LeadCommercialSurfacePayload | null> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId },
    include: {
      customer: { select: { id: true, displayName: true } },
      serviceLocation: {
        select: {
          id: true,
          organizationId: true,
          apn: true,
          detailsStatus: true,
          utility: { select: { name: true } },
          jurisdiction: { select: { name: true } },
        },
      },
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

  const requestJson = readRequest(lead.request);
  const { signalsJson } = leadReviewFactsFromLeadJson({
    request: lead.request,
    signals: lead.signals,
  });

  const jobsiteAddressLine = jobsiteLineFromLead({
    address: lead.address,
    signals: lead.signals,
  });

  let customerPrimaryLocation: { googlePlaceId: string } | null = null;
  if (lead.customerId) {
    customerPrimaryLocation = await db.customerServiceLocation.findFirst({
      where: { customerId: lead.customerId, organizationId: ctx.organizationId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { googlePlaceId: true },
    });
  }

  const isAddressQuoteReady = isLeadAddressQuoteReady(
    { address: lead.address, signals: lead.signals },
    customerPrimaryLocation,
  );
  const safeServiceLocation =
    lead.serviceLocation && lead.serviceLocation.organizationId === ctx.organizationId
      ? lead.serviceLocation
      : null;
  const resolvedSiteDetails = safeServiceLocation
    ? await resolveSiteDetailsForServiceLocation(
        db as unknown as Parameters<typeof resolveSiteDetailsForServiceLocation>[0],
        { organizationId: ctx.organizationId, serviceLocationId: safeServiceLocation.id },
      )
    : null;
  const siteDetails = resolvedSiteDetails
    ? {
        apn: resolvedSiteDetails.apn,
        apnSourceTitle: resolvedSiteDetails.apnSourceTitle,
        apnSourceUrl: resolvedSiteDetails.apnSourceUrl,
        apnVerificationUrl: resolvedSiteDetails.apnVerificationUrl,
        apnConflict: resolvedSiteDetails.apnConflict
          ? {
              value: resolvedSiteDetails.apnConflict.value,
              sourceTitle: resolvedSiteDetails.apnConflict.sourceTitle,
              sourceUrl: resolvedSiteDetails.apnConflict.sourceUrl,
            }
          : null,
        utilityName: resolvedSiteDetails.utility?.name ?? null,
        utilityOfficialWebsite: resolvedSiteDetails.utility?.officialWebsite ?? null,
        utilityServiceUpgradeUrl: resolvedSiteDetails.utility?.serviceUpgradeUrl ?? null,
        utilityCoverageSourceTitle: resolvedSiteDetails.utility?.coverageSourceTitle ?? null,
        utilityCoverageSourceUrl: resolvedSiteDetails.utility?.coverageSourceUrl ?? null,
        jurisdictionName: resolvedSiteDetails.jurisdiction?.name ?? null,
        jurisdictionBuildingDepartmentName:
          resolvedSiteDetails.jurisdiction?.buildingDepartmentName ?? null,
        jurisdictionOfficialWebsite: resolvedSiteDetails.jurisdiction?.officialWebsite ?? null,
        jurisdictionBuildingDepartmentUrl: resolvedSiteDetails.jurisdiction?.buildingDepartmentUrl ?? null,
        jurisdictionPermitPortalUrl: resolvedSiteDetails.jurisdiction?.permitPortalUrl ?? null,
        jurisdictionFormsUrl: null,
        jurisdictionInspectionsUrl: null,
        assessorCounty: resolvedSiteDetails.assessorResource?.county ?? null,
        assessorState: resolvedSiteDetails.assessorResource?.state ?? null,
        assessorSearchUrl: resolvedSiteDetails.assessorResource?.assessorSearchUrl ?? null,
        assessorParcelGisUrl: resolvedSiteDetails.assessorResource?.parcelGisUrl ?? null,
        detailsStatus: resolvedSiteDetails.detailsStatus,
        missingScopes: resolvedSiteDetails.missingScopes,
      }
    : null;

  const [linkedQuotes, attachments, leadEvents] = await Promise.all([
    db.quote.findMany({
      where: { leadId: lead.id, organizationId: ctx.organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        job: { select: { id: true, status: true, organizationId: true } },
        _count: { select: { lineItems: true } },
      },
    }),
    db.attachment.findMany({
      where: {
        organizationId: ctx.organizationId,
        leadId: lead.id,
        status: AttachmentStatus.READY,
      },
      orderBy: { createdAt: "desc" },
      take: LEAD_ATTACHMENT_CAP,
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        contentType: true,
      },
    }),
    db.leadEvent.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      take: LEAD_EVENT_CAP,
      select: {
        id: true,
        type: true,
        payload: true,
        createdAt: true,
      },
    }),
  ]);

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

  const progressQuoteInputs = linkedQuotes.map((q) => ({
    id: q.id,
    title: q.title,
    status: q.status,
    totalCents: q.totalCents,
    lineItemCount: q._count.lineItems,
    updatedAt: q.updatedAt,
    job:
      q.job && q.job.organizationId === ctx.organizationId
        ? { id: q.job.id, status: q.job.status }
        : null,
  }));

  const progress = getLeadCommercialProgress({
    lead: {
      status: lead.status,
      followUpAt: lead.followUpAt,
      customerId: lead.customerId,
      contactName: projected.contactName,
      companyName: projected.companyName,
      email: projected.email,
      phone: projected.phone,
      jobsiteAddressLine,
      isAddressVerified: isAddressQuoteReady,
    },
    quotes: progressQuoteInputs,
    hasExistingCustomerMatch: matchHints?.kind === "checked" && matchHints.matches.length > 0,
  });

  const neededByDate =
    requestJson.neededByDate instanceof Date
      ? requestJson.neededByDate
      : requestJson.neededByDate
        ? new Date(requestJson.neededByDate)
        : null;

  const visitRequests: LeadVisitRequestPayload[] = lead.visitRequests.map((v) => ({
    id: v.id,
    requestedDate: v.requestedDate,
    requestedWindow: v.requestedWindow,
    confirmedDate: v.confirmedDate,
    status: v.status,
    notes: v.notes,
    createdAt: v.createdAt,
  }));

  const reviewViewModel = buildLeadReviewViewModel({
    leadId: lead.id,
    channel: lead.channel,
    notes: projected.notes,
    requestType: requestJson.type ?? projected.requestType,
    scopeSummary: requestJson.scope,
    neededByBucket: requestJson.neededByBucket,
    neededByDate,
    requestJson,
    signalsJson,
    contactName: projected.contactName,
    companyName: projected.companyName,
    email: projected.email,
    phone: projected.phone,
    jobsiteAddressLine,
    isAddressVerified: isAddressQuoteReady,
    attachments,
    events: leadEvents,
    visitRequests: lead.visitRequests,
    progress,
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

  const intakeProjection = buildLeadIntakeProjection({
    organizationId: ctx.organizationId,
    lead: {
      id: lead.id,
      status: lead.status,
      channel: lead.channel,
      customerId: lead.customerId,
      convertedAt: lead.convertedAt,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      contact: lead.contact,
      request: lead.request,
      address: lead.address,
      signals: lead.signals,
    },
    jobsiteAddressLine,
    isAddressVerified: isAddressQuoteReady,
    quotes: progressQuoteInputs,
    hasExistingCustomerMatch:
      matchHints?.kind === "checked" && matchHints.matches.length > 0,
    attachmentCount: attachments.length,
    events: leadEvents,
  });

  return {
    lead: {
      id: lead.id,
      title: projected.title,
      contactName: projected.contactName || "",
      email: projected.email || "",
      phone: projected.phone || "",
      notes: projected.notes || "",
      companyName: projected.companyName || "",
      status: lead.status,
      closeReason: lead.closeReason,
      channel: lead.channel,
      followUpAt: lead.followUpAt,
      closedAt: lead.closedAt,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      address: lead.address,
      signals: lead.signals,
      jobsiteAddressLine: jobsiteAddressLine || "",
      isAddressVerified: isLeadAddressVerified(lead),
      isAddressQuoteReady,
      requestType: requestJson.type ?? projected.requestType,
      scopeSummary: requestJson.scope,
      neededByBucket: requestJson.neededByBucket,
      neededByDate,
      serviceLocationId: lead.serviceLocationId,
      siteDetails,
    },
    customer: lead.customer
      ? {
          id: lead.customer.id,
          displayName: lead.customer.displayName,
          href: `/customers/${lead.customer.id}`,
        }
      : null,
    matchHints,
    linkedQuotes,
    progress,
    serviceAddressContext,
    visitRequests,
    reviewViewModel,
    intakeProjection,
  };
}
