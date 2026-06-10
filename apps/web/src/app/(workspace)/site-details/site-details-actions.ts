"use server";

import { revalidatePath } from "next/cache";
import {
  ServiceLocationAuditType,
  SiteDetailsSource,
  SiteDetailsStatus,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import {
  materialAddressChanged,
  pickHigherPriorityStatus,
  resolveServiceLocationIdFromEntity,
  resolveSiteDetailsForServiceLocation,
  type SiteDetailsResolved,
} from "@/lib/site-details/resolver";
import { appendServiceLocationAuditEvent } from "@/lib/site-details/audit";
import { normalizeAddressDedupKey } from "@/lib/customer-service-location-from-lead";

export type SiteDetailsActionState = {
  error?: string;
  success?: boolean;
  siteDetails?: SiteDetailsResolved | null;
};

const researchInFlightByLocation = new Map<string, Promise<SiteDetailsResolved | null>>();
const resolverDb = db as unknown as Parameters<typeof resolveSiteDetailsForServiceLocation>[0];
const auditDb = db as unknown as Parameters<typeof appendServiceLocationAuditEvent>[0];

function trimField(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function revalidateLocationSurfaces(serviceLocationId: string) {
  revalidatePath("/leads");
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath("/customers");
  revalidatePath(`/customers/${serviceLocationId}`);
}

export async function loadQuoteSiteDetailsAction(quoteId: string): Promise<SiteDetailsActionState> {
  const ctx = await getRequestContextOrThrow();
  const serviceLocationId = await resolveServiceLocationIdFromEntity(resolverDb, {
    organizationId: ctx.organizationId,
    quoteId: quoteId.trim(),
  });
  if (!serviceLocationId) return { siteDetails: null, success: true };
  const siteDetails = await resolveSiteDetailsForServiceLocation(resolverDb, {
    organizationId: ctx.organizationId,
    serviceLocationId,
  });
  return { siteDetails, success: true };
}

export async function saveSiteDetailsApnAction(
  serviceLocationId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  const apn = trimField(formData, "apn");
  const reason = trimField(formData, "reason") || "manual_apn_entry";
  if (!id) return { error: "Missing service location id." };
  const existing = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, apn: true, detailsStatus: true, detailsSource: true },
  });
  if (!existing) return { error: "Service location not found." };
  const nextStatus =
    apn && existing.apn && existing.apn !== apn
      ? SiteDetailsStatus.USER_CORRECTED
      : pickHigherPriorityStatus(existing.detailsStatus, SiteDetailsStatus.USER_REVIEWED);
  const nextSource =
    apn && existing.apn && existing.apn !== apn
      ? SiteDetailsSource.USER_CORRECTED
      : SiteDetailsSource.USER_REVIEWED;

  await db.customerServiceLocation.update({
    where: { id },
    data: {
      apn: apn || null,
      detailsStatus: nextStatus,
      detailsSource: nextSource,
      detailsReviewedAt: new Date(),
      detailsReviewedBy: ctx.userId,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType: existing.apn && existing.apn !== apn ? ServiceLocationAuditType.APN_CORRECTED : ServiceLocationAuditType.APN_SET,
    oldValue: { apn: existing.apn },
    newValue: { apn },
    sourceReason: reason,
  });
  revalidateLocationSurfaces(id);
  return { success: true };
}

export async function saveSiteDetailsUtilityAction(
  serviceLocationId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  const utilityId = trimField(formData, "utilityId");
  const reason = trimField(formData, "reason") || "manual_utility_assignment";
  if (!id || !utilityId) return { error: "Missing service location or utility id." };

  const [loc, utility] = await Promise.all([
    db.customerServiceLocation.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, utilityId: true },
    }),
    db.utility.findFirst({
      where: { id: utilityId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!loc) return { error: "Service location not found." };
  if (!utility) return { error: "Utility not found in organization scope." };

  await db.customerServiceLocation.update({
    where: { id },
    data: {
      utilityId: utility.id,
      detailsStatus: SiteDetailsStatus.USER_CORRECTED,
      detailsSource: SiteDetailsSource.USER_CORRECTED,
      detailsReviewedAt: new Date(),
      detailsReviewedBy: ctx.userId,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType:
      loc.utilityId && loc.utilityId !== utility.id
        ? ServiceLocationAuditType.UTILITY_CORRECTED
        : ServiceLocationAuditType.UTILITY_SET,
    oldValue: { utilityId: loc.utilityId },
    newValue: { utilityId: utility.id, utilityName: utility.name },
    sourceReason: reason,
  });
  revalidateLocationSurfaces(id);
  return { success: true };
}

export async function saveSiteDetailsJurisdictionAction(
  serviceLocationId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  const jurisdictionId = trimField(formData, "jurisdictionId");
  const reason = trimField(formData, "reason") || "manual_jurisdiction_assignment";
  if (!id || !jurisdictionId) return { error: "Missing service location or jurisdiction id." };

  const [loc, jurisdiction] = await Promise.all([
    db.customerServiceLocation.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, jurisdictionId: true },
    }),
    db.jurisdiction.findFirst({
      where: { id: jurisdictionId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);
  if (!loc) return { error: "Service location not found." };
  if (!jurisdiction) return { error: "Jurisdiction not found in organization scope." };

  await db.customerServiceLocation.update({
    where: { id },
    data: {
      jurisdictionId: jurisdiction.id,
      detailsStatus: SiteDetailsStatus.USER_CORRECTED,
      detailsSource: SiteDetailsSource.USER_CORRECTED,
      detailsReviewedAt: new Date(),
      detailsReviewedBy: ctx.userId,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType:
      loc.jurisdictionId && loc.jurisdictionId !== jurisdiction.id
        ? ServiceLocationAuditType.JURISDICTION_CORRECTED
        : ServiceLocationAuditType.JURISDICTION_SET,
    oldValue: { jurisdictionId: loc.jurisdictionId },
    newValue: { jurisdictionId: jurisdiction.id, jurisdictionName: jurisdiction.name },
    sourceReason: reason,
  });
  revalidateLocationSurfaces(id);
  return { success: true };
}

export async function markSiteDetailsReviewedAction(
  serviceLocationId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  const notes = trimField(formData, "notes");
  if (!id) return { error: "Missing service location id." };
  const existing = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, detailsStatus: true, detailsSource: true },
  });
  if (!existing) return { error: "Service location not found." };

  const nextStatus = pickHigherPriorityStatus(existing.detailsStatus, SiteDetailsStatus.USER_REVIEWED);
  await db.customerServiceLocation.update({
    where: { id },
    data: {
      detailsStatus: nextStatus,
      detailsSource: SiteDetailsSource.USER_REVIEWED,
      detailsReviewedAt: new Date(),
      detailsReviewedBy: ctx.userId,
    },
  });
  await db.siteDetailsReview.create({
    data: {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
      status: nextStatus,
      source: SiteDetailsSource.USER_REVIEWED,
      notes: notes || null,
      reviewedByUserId: ctx.userId,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.REVIEW_STATUS_CHANGED,
    oldValue: { detailsStatus: existing.detailsStatus, detailsSource: existing.detailsSource },
    newValue: { detailsStatus: nextStatus, detailsSource: SiteDetailsSource.USER_REVIEWED, notes },
    sourceReason: "manual_review",
  });
  revalidateLocationSurfaces(id);
  return { success: true };
}

export async function updateServiceLocationAddressAction(
  serviceLocationId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  const formattedAddress = trimField(formData, "formattedAddress");
  const addressLine1 = trimField(formData, "addressLine1");
  const city = trimField(formData, "city");
  const state = trimField(formData, "state");
  const postalCode = trimField(formData, "postalCode");
  const country = trimField(formData, "country");
  if (!id || (!formattedAddress && !addressLine1)) {
    return { error: "A formatted address or address line 1 is required." };
  }
  const existing = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      formattedAddress: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      addressFingerprint: true,
    },
  });
  if (!existing) return { error: "Service location not found." };

  const updateData: Prisma.CustomerServiceLocationUpdateInput = {
    formattedAddress: formattedAddress || existing.formattedAddress,
    addressLine1: addressLine1 || existing.addressLine1,
    city: city || existing.city,
    state: state || existing.state,
    postalCode: postalCode || existing.postalCode,
    country: country || existing.country,
    addressFingerprint: normalizeAddressDedupKey(
      formattedAddress || existing.formattedAddress,
      addressLine1 || existing.addressLine1,
    ),
  };

  const changed = materialAddressChanged(existing, updateData);
  await db.customerServiceLocation.update({
    where: { id },
    data: {
      ...updateData,
      staleAt: changed ? new Date() : null,
      staleReason: changed ? "material_address_change" : null,
      detailsStatus: changed ? SiteDetailsStatus.STALE : undefined,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.ADDRESS_UPDATED,
    oldValue: existing,
    newValue: updateData,
    sourceReason: "manual_address_update",
  });
  revalidateLocationSurfaces(id);
  return { success: true };
}

export async function requestSiteDetailsResearchAction(
  serviceLocationId: string,
): Promise<SiteDetailsActionState> {
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  if (!id) return { error: "Missing service location id." };
  const key = `${ctx.organizationId}:${id}`;
  const inFlight = researchInFlightByLocation.get(key);
  if (inFlight) {
    const siteDetails = await inFlight;
    return { success: true, siteDetails };
  }
  const pending = (async () => {
    const siteDetails = await resolveSiteDetailsForServiceLocation(resolverDb, {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
    });
    return siteDetails;
  })();
  researchInFlightByLocation.set(key, pending);
  try {
    const siteDetails = await pending;
    return { success: true, siteDetails };
  } finally {
    researchInFlightByLocation.delete(key);
  }
}

export async function reassignQuoteServiceLocationAction(
  quoteId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const qid = quoteId.trim();
  const serviceLocationId = trimField(formData, "serviceLocationId");
  const reason = trimField(formData, "reason") || "quote_location_reassignment";
  if (!qid || !serviceLocationId) return { error: "Missing quote or service location id." };

  const [quote, location] = await Promise.all([
    db.quote.findFirst({
      where: { id: qid, organizationId: ctx.organizationId },
      select: { id: true, serviceLocationId: true },
    }),
    db.customerServiceLocation.findFirst({
      where: { id: serviceLocationId, organizationId: ctx.organizationId },
      select: { id: true },
    }),
  ]);
  if (!quote) return { error: "Quote not found." };
  if (!location) return { error: "Service location not found." };

  await db.quote.update({
    where: { id: qid },
    data: { serviceLocationId: serviceLocationId },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.QUOTE_REASSIGNED,
    oldValue: { quoteId: qid, serviceLocationId: quote.serviceLocationId },
    newValue: { quoteId: qid, serviceLocationId },
    sourceReason: reason,
  });
  revalidatePath(`/quotes/${qid}`);
  return { success: true };
}

export async function reassignJobServiceLocationAction(
  jobId: string,
  _prevState: SiteDetailsActionState,
  formData: FormData,
): Promise<SiteDetailsActionState> {
  void _prevState;
  const ctx = await getRequestContextOrThrow();
  const jid = jobId.trim();
  const serviceLocationId = trimField(formData, "serviceLocationId");
  const reason = trimField(formData, "reason") || "job_location_reassignment";
  if (!jid || !serviceLocationId) return { error: "Missing job or service location id." };

  const [job, location] = await Promise.all([
    db.job.findFirst({
      where: { id: jid, organizationId: ctx.organizationId },
      select: { id: true, serviceLocationId: true },
    }),
    db.customerServiceLocation.findFirst({
      where: { id: serviceLocationId, organizationId: ctx.organizationId },
      select: { id: true },
    }),
  ]);
  if (!job) return { error: "Job not found." };
  if (!location) return { error: "Service location not found." };

  await db.job.update({
    where: { id: jid },
    data: { serviceLocationId: serviceLocationId },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.JOB_REASSIGNED,
    oldValue: { jobId: jid, serviceLocationId: job.serviceLocationId },
    newValue: { jobId: jid, serviceLocationId },
    sourceReason: reason,
  });
  revalidatePath(`/jobs/${jid}`);
  return { success: true };
}
