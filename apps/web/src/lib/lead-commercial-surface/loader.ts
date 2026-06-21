import { db } from "@/lib/db";
import { projectLead, deriveLeadTitle } from "@/lib/lead/lead-projection";
import { jobsiteLineFromLead, isLeadAddressQuoteReady, isLeadAddressVerified } from "@/lib/jobsite-address";
import { findCustomerMatchHints, LeadCustomerMatchHints } from "@/lib/lead-customer-match-hints";
import { hasBlockingCustomerMatch } from "@/lib/lead-customer-match-gate";
import {
  getOpportunityFlow,
  type OpportunityFlowChangeRequestInput,
  type OpportunityFlowView,
} from "@/lib/opportunity-flow";
import { intakeSnapshotForCustomerFromLead } from "@/lib/customer-service-location-from-lead";
import { RequestContext } from "@/lib/auth-context";
import { LeadServiceAddressContext } from "@/app/(workspace)/leads/lead-workspace-actions";
import {
  buildLeadReviewViewModel,
  leadReviewFactsFromLeadJson,
  type LeadReviewViewModel,
} from "@/lib/lead-review-view-model";
import {
  buildLeadReviewDisplay,
  type LeadReviewDisplay,
  type LeadReviewEntryPoint,
} from "@/lib/lead-review-display";
import { readRequest } from "@/lib/lead/lead-projection";
import {
  buildLeadIntakeProjection,
  type LeadIntakeProjection,
} from "@/lib/lead-intake-projection";
import type { LeadVisitRequestPayload } from "@/lib/lead-display";
import { canViewLeadVisitAccessDetails, canEditLeadVisitAccessDetails } from "@/lib/scheduling/lead-visit-access";
import {
  resolveLeadSurfaceAccess,
  ASSIGNED_LEAD_CONTEXT_VISIT_STATUSES,
  canLoadLeadVisitSchedulerStaff,
} from "@/lib/scheduling/lead-visit-lead-access";
import { presentOpportunityFlowForAssignedVisitSurface } from "@/lib/scheduling/assigned-lead-visit-surface-presentation";
import {
  serializeLeadVisitRequest,
  toOpportunityFlowVisitInput,
} from "@/lib/scheduling/serialize-lead-visit-request";
import { resolveSiteDetailsForServiceLocation } from "@/lib/site-details/resolver";
import {
  siteDetailsPayloadFromResolved,
  type SiteDetailsPayload,
} from "@/lib/site-details/presentation";

import { AttachmentStatus, LeadChannel, LeadCloseReason, LeadStatus, NeededByBucket, StaffRole } from "@prisma/client";

const CUSTOMER_LINK_FETCH_CAP = 500;
const LEAD_ATTACHMENT_CAP = 20;
const LEAD_EVENT_CAP = 30;

export type LeadSurfaceMode = "commercial" | "assigned_visit";

export type SchedulerStaffOption = {
  id: string;
  label: string;
};

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
    siteDetails: SiteDetailsPayload | null;
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
  hasBlockingCustomerMatch: boolean;
  opportunityFlow: OpportunityFlowView;
  serviceAddressContext: LeadServiceAddressContext;
  visitRequests: LeadVisitRequestPayload[];
  reviewViewModel: LeadReviewViewModel;
  /** Display allocation for review chrome — derived, not persisted. */
  reviewDisplay: LeadReviewDisplay;
  /** Derived DTO for future AI prompts — not persisted. */
  intakeProjection: LeadIntakeProjection;
  surfaceMode: LeadSurfaceMode;
  schedulerStaffOptions: SchedulerStaffOption[];
  /** FIELD-safe office handoff copy on restricted assigned-visit surface. */
  assignedFieldStatusLine: string | null;
}

export function buildReviewDisplayForPayload(
  payload: Pick<
    LeadCommercialSurfacePayload,
    "lead" | "customer" | "reviewViewModel" | "serviceAddressContext"
  >,
  entryPoint: LeadReviewEntryPoint,
): LeadReviewDisplay {
  return buildLeadReviewDisplay({
    entryPoint,
    lead: {
      title: payload.lead.title,
      contactName: payload.lead.contactName,
      companyName: payload.lead.companyName,
      email: payload.lead.email,
      phone: payload.lead.phone,
      channel: payload.lead.channel,
      jobsiteAddressLine: payload.lead.jobsiteAddressLine,
      scopeSummary: payload.lead.scopeSummary,
      requestType: payload.lead.requestType,
      serviceLocationId: payload.lead.serviceLocationId,
      isAddressVerified: payload.lead.isAddressVerified,
      isAddressQuoteReady: payload.lead.isAddressQuoteReady,
    },
    customer: payload.customer,
    reviewViewModel: payload.reviewViewModel,
    serviceAddressContext: payload.serviceAddressContext,
  });
}

async function loadSchedulerStaffOptions(
  organizationId: string,
): Promise<SchedulerStaffOption[]> {
  const memberships = await db.membership.findMany({
    where: {
      organizationId,
      role: {
        in: [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE, StaffRole.FIELD],
      },
    },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return memberships.map((membership) => ({
    id: membership.user.id,
    label: membership.user.name ?? membership.user.email ?? membership.user.id,
  }));
}

export async function loadLeadSurface(
  leadId: string,
  ctx: RequestContext,
): Promise<LeadCommercialSurfacePayload | null> {
  const access = await resolveLeadSurfaceAccess(ctx, leadId);
  if (access.mode === "denied") return null;

  if (access.mode === "commercial") {
    const payload = await loadLeadCommercialSurface(leadId, ctx);
    if (!payload) return null;
    return payload;
  }

  return loadAssignedLeadVisitSurface(leadId, ctx);
}

export async function loadAssignedLeadVisitSurface(
  leadId: string,
  ctx: RequestContext,
): Promise<LeadCommercialSurfacePayload | null> {
  const assignedVisit = await db.leadVisitRequest.findFirst({
    where: {
      organizationId: ctx.organizationId,
      leadId,
      assignedUserId: ctx.userId,
      status: { in: ASSIGNED_LEAD_CONTEXT_VISIT_STATUSES },
    },
    select: { id: true },
  });
  if (!assignedVisit) return null;

  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: ctx.organizationId },
    include: {
      visitRequests: {
        where: {
          assignedUserId: ctx.userId,
          status: { in: ASSIGNED_LEAD_CONTEXT_VISIT_STATUSES },
        },
        orderBy: { createdAt: "desc" },
        include: {
          assignedUser: { select: { name: true, email: true } },
        },
      },
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
    },
  });

  if (!lead || lead.visitRequests.length === 0) return null;

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
    ? siteDetailsPayloadFromResolved(resolvedSiteDetails)
    : null;

  const opportunityFlow = presentOpportunityFlowForAssignedVisitSurface(
    getOpportunityFlow({
      lead: {
        id: lead.id,
        status: lead.status,
        followUpAt: lead.followUpAt,
        customerId: null,
        contactName: projected.contactName,
        companyName: projected.companyName,
        email: projected.email,
        phone: projected.phone,
        jobsiteAddressLine,
        isAddressVerified: isLeadAddressVerified(lead),
      },
      quotes: [],
      visits: lead.visitRequests.map((v) => toOpportunityFlowVisitInput(v)),
      changeRequests: [],
      hasExistingCustomerMatch: false,
    }),
    lead.visitRequests.map((v) => ({
      id: v.id,
      status: v.status,
      outcome: v.outcome,
      nextAction: v.nextAction,
      updatedAt: v.updatedAt,
    })),
  );
  const { assignedFieldStatusLine, ...assignedOpportunityFlow } = opportunityFlow;
  void assignedFieldStatusLine;

  const neededByDate =
    requestJson.neededByDate instanceof Date
      ? requestJson.neededByDate
      : requestJson.neededByDate
        ? new Date(requestJson.neededByDate)
        : null;

  const visitRequests: LeadVisitRequestPayload[] = lead.visitRequests.map((v) => {
    const accessCtx = {
      role: ctx.role,
      userId: ctx.userId,
      assignedUserId: v.assignedUserId,
    };
    return serializeLeadVisitRequest(v, {
      canViewAccessDetails: canViewLeadVisitAccessDetails(accessCtx),
      canEditAccessDetails: canEditLeadVisitAccessDetails(accessCtx),
    });
  });

  const intakeSnapshot = intakeSnapshotForCustomerFromLead({
    address: lead.address,
    signals: lead.signals,
  });
  const intakeForBlock = intakeSnapshot
    ? {
        defaultDisplayAddress:
          intakeSnapshot.formattedAddress.trim() || intakeSnapshot.addressLine1.trim(),
        structuredJson: JSON.stringify(intakeSnapshot),
      }
    : { defaultDisplayAddress: "", structuredJson: "" };

  const serviceAddressContext: LeadServiceAddressContext = {
    customer: null,
    intake: intakeForBlock,
  };

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
    isAddressVerified: isLeadAddressVerified(lead),
    attachments: [],
    events: [],
    visitRequests: lead.visitRequests.map((v) => ({
      id: v.id,
      status: v.status,
      requestedDate: v.requestedDate,
      requestedWindow: v.requestedWindow,
      confirmedDate: v.confirmedDate,
      completedAt: v.completedAt,
      purpose: v.purpose,
      notes: v.notes,
    })),
  });

  const leadPayload: LeadCommercialSurfacePayload["lead"] = {
    id: lead.id,
    title: projected.title,
    contactName: projected.contactName || "",
    email: projected.email || "",
    phone: projected.phone || "",
    notes: "",
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
    isAddressQuoteReady: isLeadAddressQuoteReady({ address: lead.address, signals: lead.signals }, null),
    requestType: requestJson.type ?? projected.requestType,
    scopeSummary: requestJson.scope,
    neededByBucket: requestJson.neededByBucket,
    neededByDate,
    serviceLocationId: lead.serviceLocationId,
    siteDetails,
  };

  const intakeProjection = buildLeadIntakeProjection({
    organizationId: ctx.organizationId,
    lead: {
      id: lead.id,
      status: lead.status,
      channel: lead.channel,
      customerId: null,
      convertedAt: null,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      contact: lead.contact,
      request: lead.request,
      address: lead.address,
      signals: lead.signals,
    },
    jobsiteAddressLine,
    isAddressVerified: isLeadAddressVerified(lead),
    visits: lead.visitRequests.map((v) => toOpportunityFlowVisitInput(v)),
  });

  return {
    lead: leadPayload,
    customer: null,
    matchHints: null,
    linkedQuotes: [],
    hasBlockingCustomerMatch: false,
    opportunityFlow: assignedOpportunityFlow,
    serviceAddressContext,
    visitRequests,
    reviewViewModel,
    intakeProjection,
    reviewDisplay: buildLeadReviewDisplay({
      entryPoint: "record",
      lead: {
        title: leadPayload.title,
        contactName: leadPayload.contactName,
        companyName: leadPayload.companyName,
        email: leadPayload.email,
        phone: leadPayload.phone,
        channel: leadPayload.channel,
        jobsiteAddressLine: leadPayload.jobsiteAddressLine,
        scopeSummary: leadPayload.scopeSummary,
        requestType: leadPayload.requestType,
        serviceLocationId: leadPayload.serviceLocationId,
        isAddressVerified: leadPayload.isAddressVerified,
        isAddressQuoteReady: leadPayload.isAddressQuoteReady,
      },
      customer: null,
      reviewViewModel,
      serviceAddressContext,
    }),
    surfaceMode: "assigned_visit",
    schedulerStaffOptions: [],
    assignedFieldStatusLine,
  };
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
        orderBy: { createdAt: "desc" },
        include: {
          assignedUser: { select: { name: true, email: true } },
        },
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
  let resolvedServiceLocation: { googlePlaceId: string } | null = null;
  if (lead.customerId) {
    if (lead.serviceLocationId) {
      const resolved = await db.customerServiceLocation.findFirst({
        where: {
          id: lead.serviceLocationId,
          customerId: lead.customerId,
          organizationId: ctx.organizationId,
        },
        select: { googlePlaceId: true },
      });
      resolvedServiceLocation = resolved;
    }
    if (!resolvedServiceLocation) {
      customerPrimaryLocation = await db.customerServiceLocation.findFirst({
        where: { customerId: lead.customerId, organizationId: ctx.organizationId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { googlePlaceId: true },
      });
    }
  }

  const isAddressQuoteReady = isLeadAddressQuoteReady(
    { address: lead.address, signals: lead.signals },
    { resolvedServiceLocation, customerPrimaryLocation },
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
    ? siteDetailsPayloadFromResolved(resolvedSiteDetails)
    : null;

  const [linkedQuotes, attachments, leadEvents] = await Promise.all([
    db.quote.findMany({
      where: { leadId: lead.id, organizationId: ctx.organizationId },
      orderBy: { updatedAt: "desc" },
      include: {
        job: { select: { id: true, status: true, organizationId: true } },
        _count: { select: { lineItems: true } },
        checkpoints: {
          where: { kind: { in: ["SEND", "APPROVAL"] } },
          orderBy: { createdAt: "desc" },
          select: { kind: true, createdAt: true },
        },
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
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    revisionOfQuoteId: q.revisionOfQuoteId,
    revisionNumber: q.revisionNumber,
    latestSendAt: q.checkpoints.find((c) => c.kind === "SEND")?.createdAt ?? null,
    latestApprovalAt: q.checkpoints.find((c) => c.kind === "APPROVAL")?.createdAt ?? null,
    job:
      q.job && q.job.organizationId === ctx.organizationId
        ? { id: q.job.id, status: q.job.status }
        : null,
  }));

  const quoteIds = linkedQuotes.map((q) => q.id);
  const changeRequests = quoteIds.length
    ? await db.quoteChangeRequest.findMany({
        where: {
          organizationId: ctx.organizationId,
          quoteId: { in: quoteIds },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          quoteId: true,
          message: true,
          createdAt: true,
          resolvedAt: true,
          resultingQuoteId: true,
          requiresVisit: true,
        },
      })
    : [];

  const changeRequestInputs: OpportunityFlowChangeRequestInput[] = changeRequests.map((row) => ({
    id: row.id,
    quoteId: row.quoteId,
    message: row.message,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resultingQuoteId: row.resultingQuoteId,
    requiresVisit: row.requiresVisit,
  }));

  const canViewAccess = canViewLeadVisitAccessDetails({
    role: ctx.role,
    userId: ctx.userId,
    assignedUserId: null,
  });

  const opportunityFlow = getOpportunityFlow({
    lead: {
      id: lead.id,
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
    visits: lead.visitRequests.map((v) => toOpportunityFlowVisitInput(v)),
    changeRequests: changeRequestInputs,
    hasExistingCustomerMatch:
      matchHints?.kind === "checked" && matchHints.matches.length > 0,
  });

  const neededByDate =
    requestJson.neededByDate instanceof Date
      ? requestJson.neededByDate
      : requestJson.neededByDate
        ? new Date(requestJson.neededByDate)
        : null;

  const visitRequests: LeadVisitRequestPayload[] = lead.visitRequests.map((v) => {
    const accessCtx = {
      role: ctx.role,
      userId: ctx.userId,
      assignedUserId: v.assignedUserId,
    };
    const canView =
      canViewAccess ||
      canViewLeadVisitAccessDetails(accessCtx);
    return serializeLeadVisitRequest(v, {
      canViewAccessDetails: canView,
      canEditAccessDetails: canView && canEditLeadVisitAccessDetails(accessCtx),
    });
  });

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
  });

  const blockingCustomerMatch =
    !lead.customerId &&
    matchHints != null &&
    hasBlockingCustomerMatch(matchHints);

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
    visits: lead.visitRequests.map((v) => toOpportunityFlowVisitInput(v)),
    changeRequests: changeRequestInputs,
    hasExistingCustomerMatch:
      matchHints?.kind === "checked" && matchHints.matches.length > 0,
    attachmentCount: attachments.length,
    events: leadEvents,
  });

  const leadPayload: LeadCommercialSurfacePayload["lead"] = {
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
  };

  const customerPayload: LeadCommercialSurfacePayload["customer"] = lead.customer
    ? {
        id: lead.customer.id,
        displayName: lead.customer.displayName,
        href: `/customers/${lead.customer.id}`,
      }
    : null;

  const schedulerStaffOptions = canLoadLeadVisitSchedulerStaff(ctx.role)
    ? await loadSchedulerStaffOptions(ctx.organizationId)
    : [];

  return {
    lead: leadPayload,
    customer: customerPayload,
    matchHints,
    linkedQuotes,
    hasBlockingCustomerMatch: blockingCustomerMatch,
    opportunityFlow,
    serviceAddressContext,
    visitRequests,
    reviewViewModel,
    reviewDisplay: buildReviewDisplayForPayload(
      {
        lead: leadPayload,
        customer: customerPayload,
        reviewViewModel,
        serviceAddressContext,
      },
      "record",
    ),
    intakeProjection,
    surfaceMode: "commercial",
    schedulerStaffOptions,
    assignedFieldStatusLine: null,
  };
}
