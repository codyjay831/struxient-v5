"use server";

import { revalidatePath } from "next/cache";
import {
  ServiceLocationAuditType,
  SourceStatus,
  SiteDetailsSource,
  SiteDetailsStatus,
  UtilityType,
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
import { AIService } from "@/lib/ai/ai-service";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import {
  buildElectricUtilityNameAliases,
  canonicalizeElectricUtilityName,
} from "@/lib/site-details/utility-name";
import {
  findUtilityCoverageMatches,
} from "@/lib/site-details/utility-coverage";
import type { UtilityCandidateDecisionReason } from "@/lib/site-details/utility-candidate";

export type SiteDetailsActionState = {
  error?: string;
  success?: boolean;
  siteDetails?: SiteDetailsResolved | null;
};

export type SiteDetailsOption = {
  id: string;
  name: string;
};

const researchInFlightByLocation = new Map<string, Promise<SiteDetailsResolved | null>>();
const resolverDb = db as unknown as Parameters<typeof resolveSiteDetailsForServiceLocation>[0];
const auditDb = db as unknown as Parameters<typeof appendServiceLocationAuditEvent>[0];
const CONTROLLED_CANONICAL_UTILITIES = new Set([
  "PG&E",
  "San Diego Gas & Electric",
  "Southern California Edison",
]);

function trimField(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function revalidateLocationSurfaces(serviceLocationId: string) {
  revalidatePath("/leads");
  revalidatePath("/quotes");
  revalidatePath("/jobs");
  revalidatePath("/customers");
  const row = await db.customerServiceLocation.findUnique({
    where: { id: serviceLocationId },
    select: { customerId: true },
  });
  if (row?.customerId) {
    revalidatePath(`/customers/${row.customerId}`);
  }
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

export async function listElectricUtilityOptionsAction(): Promise<SiteDetailsOption[]> {
  const ctx = await getRequestContextOrThrow();
  const rows = await db.utility.findMany({
    where: {
      organizationId: ctx.organizationId,
      isActive: true,
      utilityType: UtilityType.ELECTRIC,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows;
}

export async function listJurisdictionOptionsAction(): Promise<SiteDetailsOption[]> {
  const ctx = await getRequestContextOrThrow();
  const rows = await db.jurisdiction.findMany({
    where: {
      organizationId: ctx.organizationId,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows;
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
    select: {
      id: true,
      apn: true,
      detailsStatus: true,
      detailsSource: true,
      apnSourceTitle: true,
      apnSourceUrl: true,
      apnDiscoveredAt: true,
      apnVerificationUrl: true,
    },
  });
  if (!existing) return { error: "Service location not found." };
  const existingApn = existing.apn?.trim() || null;
  const normalizedApn = apn || null;
  const nextStatus =
    !normalizedApn
      ? SiteDetailsStatus.UNVERIFIED
      : normalizedApn && existingApn && existingApn !== normalizedApn
        ? SiteDetailsStatus.USER_CORRECTED
        : pickHigherPriorityStatus(existing.detailsStatus, SiteDetailsStatus.USER_REVIEWED);
  const nextSource =
    !normalizedApn
      ? SiteDetailsSource.DATABASE_MATCH
      : normalizedApn && existingApn && existingApn !== normalizedApn
        ? SiteDetailsSource.USER_CORRECTED
        : SiteDetailsSource.USER_REVIEWED;

  await db.customerServiceLocation.update({
    where: { id },
    data: {
      apn: normalizedApn,
      detailsStatus: nextStatus,
      detailsSource: nextSource,
      detailsReviewedAt: normalizedApn ? new Date() : null,
      detailsReviewedBy: normalizedApn ? ctx.userId : null,
      apnSourceTitle: normalizedApn ? existing.apnSourceTitle : null,
      apnSourceUrl: normalizedApn ? existing.apnSourceUrl : null,
      apnConflictValue: null,
      apnConflictSourceTitle: null,
      apnConflictSourceUrl: null,
      apnConflictDetectedAt: null,
      apnDiscoveredAt: normalizedApn ? existing.apnDiscoveredAt : null,
      apnResearchUsageLogId: normalizedApn ? undefined : null,
      apnVerificationUrl: normalizedApn ? existing.apnVerificationUrl : null,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType:
      !normalizedApn
        ? ServiceLocationAuditType.APN_CLEARED
        : existingApn && existingApn !== normalizedApn
          ? ServiceLocationAuditType.APN_CORRECTED
          : ServiceLocationAuditType.APN_SET,
    oldValue: {
      apn: existingApn,
      sourceTitle: existing.apnSourceTitle,
      sourceUrl: existing.apnSourceUrl,
      discoveredAt: existing.apnDiscoveredAt,
      verificationUrl: existing.apnVerificationUrl,
    },
    newValue: { apn: normalizedApn, preservedDiscoverySource: Boolean(normalizedApn) },
    sourceReason: reason,
  });
  await revalidateLocationSurfaces(id);
  return { success: true };
}

export async function confirmSiteDetailsApnAction(
  serviceLocationId: string,
): Promise<SiteDetailsActionState> {
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  if (!id) return { error: "Missing service location id." };
  const existing = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      apn: true,
      detailsStatus: true,
      detailsSource: true,
      apnSourceTitle: true,
      apnSourceUrl: true,
      apnVerificationUrl: true,
    },
  });
  if (!existing) return { error: "Service location not found." };
  if (!existing.apn?.trim()) return { error: "No APN to confirm." };
  const nextStatus = pickHigherPriorityStatus(existing.detailsStatus, SiteDetailsStatus.USER_REVIEWED);
  await db.customerServiceLocation.update({
    where: { id },
    data: {
      detailsStatus: nextStatus,
      detailsSource: SiteDetailsSource.USER_REVIEWED,
      detailsReviewedAt: new Date(),
      detailsReviewedBy: ctx.userId,
      apnConflictValue: null,
      apnConflictSourceTitle: null,
      apnConflictSourceUrl: null,
      apnConflictDetectedAt: null,
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.APN_CONFIRMED,
    oldValue: { detailsStatus: existing.detailsStatus, detailsSource: existing.detailsSource },
    newValue: {
      detailsStatus: nextStatus,
      detailsSource: SiteDetailsSource.USER_REVIEWED,
      apn: existing.apn.trim(),
      sourceTitle: existing.apnSourceTitle,
      sourceUrl: existing.apnSourceUrl,
      verificationUrl: existing.apnVerificationUrl,
    },
    sourceReason: "manual_apn_confirm",
  });
  await revalidateLocationSurfaces(id);
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
  const reason = trimField(formData, "reason") || "manual_utility_update";
  if (!id) return { error: "Missing service location id." };

  const loc = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, utilityId: true },
  });
  if (!loc) return { error: "Service location not found." };

  if (!utilityId) {
    await db.customerServiceLocation.update({
      where: { id },
      data: {
        utilityId: null,
        detailsStatus: SiteDetailsStatus.UNVERIFIED,
        detailsSource: SiteDetailsSource.DATABASE_MATCH,
        detailsReviewedAt: null,
        detailsReviewedBy: null,
      },
    });
    await appendServiceLocationAuditEvent(auditDb, {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
      actorUserId: ctx.userId,
      eventType: ServiceLocationAuditType.UTILITY_CORRECTED,
      oldValue: { utilityId: loc.utilityId },
      newValue: { utilityId: null },
      sourceReason: reason || "manual_utility_clear",
    });
    await revalidateLocationSurfaces(id);
    return { success: true };
  }

  const utility = await db.utility.findFirst({
    where: {
      id: utilityId,
      organizationId: ctx.organizationId,
      isActive: true,
      utilityType: UtilityType.ELECTRIC,
    },
    select: { id: true, name: true },
  });
  if (!utility) return { error: "Electric utility not found in organization scope." };

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
  await revalidateLocationSurfaces(id);
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
  const reason = trimField(formData, "reason") || "manual_jurisdiction_update";
  if (!id) return { error: "Missing service location id." };

  const loc = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, jurisdictionId: true },
  });
  if (!loc) return { error: "Service location not found." };

  if (!jurisdictionId) {
    await db.customerServiceLocation.update({
      where: { id },
      data: {
        jurisdictionId: null,
        detailsStatus: SiteDetailsStatus.UNVERIFIED,
        detailsSource: SiteDetailsSource.DATABASE_MATCH,
        detailsReviewedAt: null,
        detailsReviewedBy: null,
      },
    });
    await appendServiceLocationAuditEvent(auditDb, {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
      actorUserId: ctx.userId,
      eventType: ServiceLocationAuditType.JURISDICTION_CORRECTED,
      oldValue: { jurisdictionId: loc.jurisdictionId },
      newValue: { jurisdictionId: null },
      sourceReason: reason || "manual_jurisdiction_clear",
    });
    await revalidateLocationSurfaces(id);
    return { success: true };
  }

  const jurisdiction = await db.jurisdiction.findFirst({
    where: { id: jurisdictionId, organizationId: ctx.organizationId, isActive: true },
    select: { id: true, name: true },
  });
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
  await revalidateLocationSurfaces(id);
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
  await revalidateLocationSurfaces(id);
  return { success: true };
}

export async function clearUnreviewedAiSiteDetailsAction(
  serviceLocationId: string,
): Promise<SiteDetailsActionState> {
  const ctx = await getRequestContextOrThrow();
  const id = serviceLocationId.trim();
  if (!id) return { error: "Missing service location id." };

  const existing = await db.customerServiceLocation.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: {
      id: true,
      detailsStatus: true,
      detailsSource: true,
      apn: true,
      utilityId: true,
      jurisdictionId: true,
      apnConflictValue: true,
      apnConflictSourceTitle: true,
      apnConflictSourceUrl: true,
    },
  });
  if (!existing) return { error: "Service location not found." };
  if (
    existing.detailsStatus === SiteDetailsStatus.USER_REVIEWED ||
    existing.detailsStatus === SiteDetailsStatus.USER_CORRECTED
  ) {
    return { error: "Reviewed or corrected details cannot be cleared with this action." };
  }

  await db.customerServiceLocation.update({
    where: { id },
    data: {
      apn: null,
      apnSourceTitle: null,
      apnSourceUrl: null,
      apnDiscoveredAt: null,
      apnResearchUsageLogId: null,
      apnVerificationUrl: null,
      apnConflictValue: null,
      apnConflictSourceTitle: null,
      apnConflictSourceUrl: null,
      apnConflictDetectedAt: null,
      utilityId: null,
      jurisdictionId: null,
      detailsStatus: SiteDetailsStatus.UNVERIFIED,
      detailsSource: SiteDetailsSource.DATABASE_MATCH,
      detailsLastChecked: new Date(),
    },
  });
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.AI_VALUE_REJECTED,
    oldValue: {
      detailsStatus: existing.detailsStatus,
      detailsSource: existing.detailsSource,
      apn: existing.apn,
      utilityId: existing.utilityId,
      jurisdictionId: existing.jurisdictionId,
      apnConflict: existing.apnConflictValue
        ? {
            value: existing.apnConflictValue,
            sourceTitle: existing.apnConflictSourceTitle,
            sourceUrl: existing.apnConflictSourceUrl,
          }
        : null,
    },
    newValue: { cleared: true, preservedReviewedValues: true },
    sourceReason: "manual_clear_unreviewed_ai_results",
  });
  await revalidateLocationSurfaces(id);
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
      apn: true,
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
      apn: changed ? null : undefined,
      apnConflictValue: changed ? null : undefined,
      apnConflictSourceTitle: changed ? null : undefined,
      apnConflictSourceUrl: changed ? null : undefined,
      apnConflictDetectedAt: changed ? null : undefined,
    },
  });
  if (changed && existing.apn?.trim()) {
    await appendServiceLocationAuditEvent(auditDb, {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
      actorUserId: ctx.userId,
      eventType: ServiceLocationAuditType.APN_MARKED_STALE,
      oldValue: { apn: existing.apn },
      newValue: { apn: null, reason: "material_address_change" },
      sourceReason: "material_address_change",
    });
  }
  await appendServiceLocationAuditEvent(auditDb, {
    organizationId: ctx.organizationId,
    serviceLocationId: id,
    actorUserId: ctx.userId,
    eventType: ServiceLocationAuditType.ADDRESS_UPDATED,
    oldValue: existing,
    newValue: updateData,
    sourceReason: "manual_address_update",
  });
  await revalidateLocationSurfaces(id);
  return { success: true };
}

export async function requestSiteDetailsResearchAction(
  serviceLocationId: string,
  requestedScopes?: string[],
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
    // #region agent log
    console.error("[agent-debug] a9eae3 pendingEntry reached", {
      runId: "pre-fix-3",
      hypothesisId: "H11",
      serviceLocationId: id,
      requestedScopesParam: requestedScopes ?? null,
    });
    // #endregion
    // #region agent log
    await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
      body: JSON.stringify({
        sessionId: "a9eae3",
        runId: "pre-fix-2",
        hypothesisId: "H9",
        location: "site-details-actions.ts:pendingEntry",
        message: "Entered requestSiteDetailsResearchAction pending block",
        data: {
          serviceLocationId: id,
          requestedScopesParam: requestedScopes ?? null,
          organizationId: ctx.organizationId,
        },
        timestamp: Date.now(),
      }),
    }).catch((error) => {
      console.error(
        "[agent-debug] a9eae3 log send failed",
        error instanceof Error ? error.message : String(error),
      );
    });
    // #endregion
    const before = await resolveSiteDetailsForServiceLocation(resolverDb, {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
    });
    if (!before) return null;
    const requested = Array.isArray(requestedScopes)
      ? before.missingScopes.filter((scope) => requestedScopes.includes(scope))
      : before.missingScopes;
    if (requested.length === 0) return before;
    const location = await db.customerServiceLocation.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        city: true,
        state: true,
        postalCode: true,
        apn: true,
        apnSourceTitle: true,
        apnSourceUrl: true,
        apnDiscoveredAt: true,
        apnVerificationUrl: true,
        apnConflictValue: true,
        apnConflictSourceTitle: true,
        apnConflictSourceUrl: true,
        apnConflictDetectedAt: true,
        utilityId: true,
        jurisdictionId: true,
        detailsStatus: true,
        detailsSource: true,
      },
    });
    if (!location) return before;

    const research = await AIService.researchSiteDetails({
      organizationId: ctx.organizationId,
      serviceLocationId: id,
      addressLine: before.addressLine ?? "",
      missingScopes: requested,
      existingOfficialVerificationUrl: before.assessorResource?.assessorSearchUrl ?? null,
    });
    // #region agent log
    await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
      body: JSON.stringify({
        sessionId: "a9eae3",
        runId: "pre-fix-1",
        hypothesisId: "H3",
        location: "site-details-actions.ts:afterResearch",
        message: "Research output entering persistence action",
        data: {
          requestedScopes: requested,
          utilityScopeDecision: research.scopeDecisions.electricUtility,
          jurisdictionScopeDecision: research.scopeDecisions.jurisdiction,
          assessorScopeDecision: research.scopeDecisions.assessor,
          apnScopeDecision: research.scopeDecisions.apn,
          hasUtilityCandidate: Boolean(research.electricUtilityCandidate),
          utilityDecisionReason: research.diagnostics?.utilityDecisionReason ?? null,
          overallOutcome: research.diagnostics?.overallOutcome ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch((error) => {
      console.error(
        "[agent-debug] a9eae3 log send failed",
        error instanceof Error ? error.message : String(error),
      );
    });
    // #endregion
    const requestedSet = new Set(requested);
    const coverageCounty = research.countyAssessorCounty ?? null;

    let utilityId: string | null = null;
    let jurisdictionId: string | null = null;
    let assessorUpserted = false;
    const existingApn = location.apn?.trim() || null;
    const apnCandidate = research.apnCandidate;
    const assessorVerificationUrl =
      research.countyAssessorSearchUrl ??
      before.assessorResource?.assessorSearchUrl ??
      null;
    const apnSourceTitle = apnCandidate?.sourceTitle ?? null;
    const apnSourceUrl = apnCandidate?.sourceUrl ?? null;
    const apnValue = apnCandidate?.value.trim() || null;
    let apnConflictDetected = false;
    let apnDiscovered = false;
    let apnRefreshed = false;
    let rejectedUtilityCandidate = false;
    let utilityDecisionReason:
      | UtilityCandidateDecisionReason
      | "GROUNDING_METADATA_MISSING"
      | "UTILITY_CANONICAL_MATCH_FAILED"
      | null = research.diagnostics?.utilityDecisionReason ?? null;
    const apnDecisionReason = research.diagnostics?.apnDecisionReason ?? null;

    if (requestedSet.has("UTILITY") && research.electricUtilityCandidate) {
      const utilityCandidate = research.electricUtilityCandidate;
      const canonicalUtilityName = canonicalizeElectricUtilityName(utilityCandidate.name);
      const utilityNameAliases = buildElectricUtilityNameAliases(utilityCandidate.name);
      let existingUtility = await db.utility.findFirst({
        where: {
          organizationId: ctx.organizationId,
          name: { in: utilityNameAliases },
          utilityType: UtilityType.ELECTRIC,
          isActive: true,
        },
        select: { id: true, name: true },
      });
      if (!existingUtility && CONTROLLED_CANONICAL_UTILITIES.has(canonicalUtilityName)) {
        existingUtility = await db.utility.upsert({
          where: {
            organizationId_name: {
              organizationId: ctx.organizationId,
              name: canonicalUtilityName,
            },
          },
          update: {
            utilityType: UtilityType.ELECTRIC,
            isActive: true,
          },
          create: {
            organizationId: ctx.organizationId,
            name: canonicalUtilityName,
            utilityType: UtilityType.ELECTRIC,
            isActive: true,
          },
          select: { id: true, name: true },
        });
      }
      const existingCoverageMatch = existingUtility
        ? await findUtilityCoverageMatches(db as unknown as Parameters<typeof findUtilityCoverageMatches>[0], {
            organizationId: ctx.organizationId,
            utilityId: existingUtility.id,
            location: {
              postalCode: location.postalCode,
              city: location.city,
              state: location.state,
              county: coverageCounty,
            },
          })
        : [];
      const hasCoverageEvidence = Boolean(utilityCandidate.coverageSourceUrl?.trim());
      // #region agent log
      await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
        body: JSON.stringify({
          sessionId: "a9eae3",
          runId: "pre-fix-1",
          hypothesisId: "H4",
          location: "site-details-actions.ts:utilityBranch",
          message: "Utility candidate matching and evidence",
          data: {
            candidateName: utilityCandidate.name,
            canonicalUtilityName,
            hasCoverageEvidence,
            matchedExistingUtilityId: existingUtility?.id ?? null,
            matchedExistingUtilityName: existingUtility?.name ?? null,
            existingCoverageMatchCount: existingCoverageMatch.length,
            coverageBasis: utilityCandidate.coverageBasis,
          },
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error(
          "[agent-debug] a9eae3 log send failed",
          error instanceof Error ? error.message : String(error),
        );
      });
      // #endregion
      if (hasCoverageEvidence && existingUtility) {
        const utility = await db.utility.update({
          where: { id: existingUtility.id },
          data: {
            utilityType: UtilityType.ELECTRIC,
            officialWebsite: utilityCandidate.officialWebsite,
            serviceUpgradeUrl: utilityCandidate.serviceUpgradeUrl,
            officialSourceTitle: utilityCandidate.coverageSourceTitle,
            officialSourceUrl: utilityCandidate.coverageSourceUrl,
            sourceStatus: SourceStatus.UNVERIFIED,
          },
          select: { id: true, name: true },
        });
        utilityId = utility.id;
        const coverageType =
          utilityCandidate.coverageBasis === "ZIP"
            ? "ZIP"
            : utilityCandidate.coverageBasis === "COUNTY"
              ? "COUNTY"
              : "CITY";
        const coverageValue =
          coverageType === "ZIP"
            ? location.postalCode
            : coverageType === "COUNTY"
              ? coverageCounty ?? location.city
              : location.city;
        if (coverageValue.trim()) {
          await db.utilityCoverage.upsert({
            where: {
              id: `${ctx.organizationId}:${utility.id}:${coverageType}:${coverageValue}:${location.state}`,
            },
            update: {
              coverageType,
              coverageValue,
              state: location.state,
              city: location.city || null,
              county: coverageCounty,
              sourceUrl: utilityCandidate.coverageSourceUrl,
              sourceTitle: utilityCandidate.coverageSourceTitle,
              sourceStatus: SourceStatus.UNVERIFIED,
              isActive: true,
            },
            create: {
              id: `${ctx.organizationId}:${utility.id}:${coverageType}:${coverageValue}:${location.state}`,
              organizationId: ctx.organizationId,
              utilityId: utility.id,
              coverageType,
              coverageValue,
              state: location.state,
              city: location.city || null,
              county: coverageCounty,
              sourceUrl: utilityCandidate.coverageSourceUrl,
              sourceTitle: utilityCandidate.coverageSourceTitle,
              sourceStatus: SourceStatus.UNVERIFIED,
              isActive: true,
            },
          });
        }
      } else if (!existingUtility) {
        rejectedUtilityCandidate = true;
        utilityDecisionReason = "UTILITY_CANONICAL_MATCH_FAILED";
      } else {
        rejectedUtilityCandidate = true;
      }
    }

    if (requestedSet.has("UTILITY") && !utilityId) {
      const coverageMatches = await findUtilityCoverageMatches(
        db as unknown as Parameters<typeof findUtilityCoverageMatches>[0],
        {
          organizationId: ctx.organizationId,
          electricOnly: true,
          location: {
            postalCode: location.postalCode,
            city: location.city,
            state: location.state,
            county: coverageCounty,
          },
        },
      );
      const uniqueUtilityIds = [...new Set(coverageMatches.map((row) => row.utilityId))];
      if (uniqueUtilityIds.length === 1) {
        utilityId = uniqueUtilityIds[0] ?? null;
      }
    }
    // #region agent log
    await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
      body: JSON.stringify({
        sessionId: "a9eae3",
        runId: "pre-fix-1",
        hypothesisId: "H4",
        location: "site-details-actions.ts:utilityResolved",
        message: "Utility resolution before location write",
        data: {
          utilityId,
          rejectedUtilityCandidate,
          utilityDecisionReason,
          requestedUtilityScope: requestedSet.has("UTILITY"),
        },
        timestamp: Date.now(),
      }),
    }).catch((error) => {
      console.error(
        "[agent-debug] a9eae3 log send failed",
        error instanceof Error ? error.message : String(error),
      );
    });
    // #endregion

    if (requestedSet.has("JURISDICTION") && research.jurisdictionName && research.jurisdictionType) {
      const jurisdiction = await db.jurisdiction.upsert({
        where: {
          organizationId_name_state_jurisdictionType: {
            organizationId: ctx.organizationId,
            name: research.jurisdictionName,
            state: research.countyAssessorState ?? "UNKNOWN",
            jurisdictionType: research.jurisdictionType,
          },
        },
        update: {
          county: research.countyAssessorCounty,
          officialWebsite: research.jurisdictionOfficialWebsite,
          sourceTitle: research.sourceLinks[0]?.title ?? undefined,
          sourceUrl: research.sourceLinks[0]?.url ?? undefined,
          sourceStatus: SourceStatus.UNVERIFIED,
        },
        create: {
          organizationId: ctx.organizationId,
          name: research.jurisdictionName,
          jurisdictionType: research.jurisdictionType,
          state: research.countyAssessorState ?? "UNKNOWN",
          county: research.countyAssessorCounty,
          officialWebsite: research.jurisdictionOfficialWebsite,
          sourceTitle: research.sourceLinks[0]?.title ?? null,
          sourceUrl: research.sourceLinks[0]?.url ?? null,
          sourceStatus: SourceStatus.UNVERIFIED,
        },
        select: { id: true, name: true },
      });
      jurisdictionId = jurisdiction.id;
    }

    if (
      requestedSet.has("ASSESSOR_RESOURCE") &&
      research.countyAssessorCounty &&
      research.countyAssessorState &&
      research.countyAssessorSearchUrl
    ) {
      await db.countyAssessorResource.upsert({
        where: {
          organizationId_county_state: {
            organizationId: ctx.organizationId,
            county: research.countyAssessorCounty,
            state: research.countyAssessorState,
          },
        },
        update: {
          assessorSearchUrl: research.countyAssessorSearchUrl,
          sourceStatus: SourceStatus.UNVERIFIED,
        },
        create: {
          organizationId: ctx.organizationId,
          county: research.countyAssessorCounty,
          state: research.countyAssessorState,
          assessorSearchUrl: research.countyAssessorSearchUrl,
          sourceUrl: research.sourceLinks[0]?.url ?? null,
          sourceTitle: research.sourceLinks[0]?.title ?? null,
          sourceStatus: SourceStatus.UNVERIFIED,
        },
      });
      assessorUpserted = true;
    }

    const shouldProtectReviewed =
      location.detailsStatus === SiteDetailsStatus.USER_REVIEWED ||
      location.detailsStatus === SiteDetailsStatus.USER_CORRECTED;
    const canApplyApnCandidate = !shouldProtectReviewed || !existingApn;
    const canApplyUtilityCandidate = !shouldProtectReviewed || !location.utilityId;
    const canApplyJurisdictionCandidate = !shouldProtectReviewed || !location.jurisdictionId;
    const canApplyAnyAiValue =
      !shouldProtectReviewed ||
      canApplyApnCandidate ||
      canApplyUtilityCandidate ||
      canApplyJurisdictionCandidate;
    if (canApplyAnyAiValue) {
      const updates: Prisma.CustomerServiceLocationUncheckedUpdateInput = {
        utilityId: canApplyUtilityCandidate ? (utilityId ?? undefined) : undefined,
        jurisdictionId: canApplyJurisdictionCandidate ? (jurisdictionId ?? undefined) : undefined,
        detailsLastChecked: new Date(),
      };

      if (canApplyApnCandidate && apnValue && !existingApn) {
        updates.apn = apnValue;
        updates.apnSourceTitle = apnSourceTitle;
        updates.apnSourceUrl = apnSourceUrl;
        updates.apnDiscoveredAt = new Date();
        updates.apnResearchUsageLogId = research.usageLogId ?? undefined;
        updates.apnVerificationUrl = assessorVerificationUrl;
        updates.apnConflictValue = null;
        updates.apnConflictSourceTitle = null;
        updates.apnConflictSourceUrl = null;
        updates.apnConflictDetectedAt = null;
        apnDiscovered = true;
      } else if (!shouldProtectReviewed && apnValue && existingApn && existingApn === apnValue) {
        updates.apnSourceTitle = apnSourceTitle ?? location.apnSourceTitle;
        updates.apnSourceUrl = apnSourceUrl ?? location.apnSourceUrl;
        updates.apnDiscoveredAt = new Date();
        updates.apnResearchUsageLogId = research.usageLogId ?? undefined;
        updates.apnVerificationUrl = assessorVerificationUrl ?? location.apnVerificationUrl;
        updates.apnConflictValue = null;
        updates.apnConflictSourceTitle = null;
        updates.apnConflictSourceUrl = null;
        updates.apnConflictDetectedAt = null;
        apnRefreshed = true;
      } else if (apnValue && existingApn && existingApn !== apnValue) {
        updates.detailsStatus = SiteDetailsStatus.CONFLICT;
        updates.apnConflictValue = apnValue;
        updates.apnConflictSourceTitle = apnSourceTitle;
        updates.apnConflictSourceUrl = apnSourceUrl;
        updates.apnConflictDetectedAt = new Date();
        apnConflictDetected = true;
      }
      const acceptedAnyAiValue =
        Boolean(canApplyUtilityCandidate && utilityId) ||
        Boolean(canApplyJurisdictionCandidate && jurisdictionId) ||
        apnDiscovered ||
        apnRefreshed;
      if (acceptedAnyAiValue) {
        updates.detailsStatus = pickHigherPriorityStatus(location.detailsStatus, SiteDetailsStatus.AI_FOUND);
        updates.detailsSource = SiteDetailsSource.AI_FOUND;
      }
      // #region agent log
      await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
        body: JSON.stringify({
          sessionId: "a9eae3",
          runId: "pre-fix-1",
          hypothesisId: "H5",
          location: "site-details-actions.ts:beforeLocationUpdate",
          message: "Final location updates payload",
          data: {
            acceptedAnyAiValue,
            canApplyUtilityCandidate,
            canApplyJurisdictionCandidate,
            canApplyApnCandidate,
            utilityId,
            jurisdictionId,
            apnDiscovered,
            apnRefreshed,
            updates,
          },
          timestamp: Date.now(),
        }),
      }).catch((error) => {
        console.error(
          "[agent-debug] a9eae3 log send failed",
          error instanceof Error ? error.message : String(error),
        );
      });
      // #endregion

      await db.customerServiceLocation.update({
        where: { id },
        data: updates,
      });
      if (acceptedAnyAiValue || assessorUpserted) {
        await appendServiceLocationAuditEvent(auditDb, {
          organizationId: ctx.organizationId,
          serviceLocationId: id,
          actorUserId: ctx.userId,
          eventType: ServiceLocationAuditType.AI_VALUE_ACCEPTED,
          oldValue: {
            utilityId: before.utility?.id ?? null,
            jurisdictionId: before.jurisdiction?.id ?? null,
          },
          newValue: {
            utilityId,
            jurisdictionId,
            apn: apnDiscovered || apnRefreshed ? apnValue : existingApn,
            assessorCounty: research.countyAssessorCounty,
            assessorState: research.countyAssessorState,
          },
          sourceReason: "site_details_missing_scope_research",
        });
      }
      if (rejectedUtilityCandidate) {
        await appendServiceLocationAuditEvent(auditDb, {
          organizationId: ctx.organizationId,
          serviceLocationId: id,
          actorUserId: ctx.userId,
          eventType: ServiceLocationAuditType.AI_VALUE_REJECTED,
          oldValue: { utilityId: location.utilityId },
          newValue: {
            rejectedCandidate: "electric_utility",
            reason: utilityDecisionReason ?? "insufficient_coverage_evidence",
          },
          sourceReason: "ai_utility_candidate_rejected",
        });
      }
      if (!apnValue && requestedSet.has("APN") && apnDecisionReason && apnDecisionReason !== "NO_EVIDENCE") {
        await appendServiceLocationAuditEvent(auditDb, {
          organizationId: ctx.organizationId,
          serviceLocationId: id,
          actorUserId: ctx.userId,
          eventType: ServiceLocationAuditType.AI_VALUE_REJECTED,
          oldValue: { apn: existingApn },
          newValue: { rejectedCandidate: "apn", reason: apnDecisionReason },
          sourceReason: "ai_apn_candidate_rejected",
        });
      }
      if (apnDiscovered || apnRefreshed) {
        await appendServiceLocationAuditEvent(auditDb, {
          organizationId: ctx.organizationId,
          serviceLocationId: id,
          actorUserId: ctx.userId,
          eventType: ServiceLocationAuditType.APN_SET,
          oldValue: {
            apn: existingApn,
            sourceTitle: location.apnSourceTitle,
            sourceUrl: location.apnSourceUrl,
            discoveredAt: location.apnDiscoveredAt,
            verificationUrl: location.apnVerificationUrl,
          },
          newValue: {
            apn: apnValue,
            sourceTitle: apnSourceTitle,
            sourceUrl: apnSourceUrl,
            discoveredAt: new Date(),
            verificationUrl: assessorVerificationUrl,
          },
          sourceReason: apnDiscovered ? "ai_apn_discovered" : "ai_apn_refreshed",
        });
      }
      if (apnConflictDetected) {
        await appendServiceLocationAuditEvent(auditDb, {
          organizationId: ctx.organizationId,
          serviceLocationId: id,
          actorUserId: ctx.userId,
          eventType: ServiceLocationAuditType.APN_CONFLICT_DETECTED,
          oldValue: { apn: existingApn },
          newValue: {
            existingApn,
            candidateApn: apnValue,
            sourceTitle: apnSourceTitle,
            sourceUrl: apnSourceUrl,
          },
          sourceReason: "ai_apn_conflict_detected",
        });
      }
    } else {
      if (apnValue && existingApn && apnValue !== existingApn) {
        await db.customerServiceLocation.update({
          where: { id },
          data: {
            apnConflictValue: apnValue,
            apnConflictSourceTitle: apnSourceTitle,
            apnConflictSourceUrl: apnSourceUrl,
            apnConflictDetectedAt: new Date(),
            detailsLastChecked: new Date(),
          },
        });
        await appendServiceLocationAuditEvent(auditDb, {
          organizationId: ctx.organizationId,
          serviceLocationId: id,
          actorUserId: ctx.userId,
          eventType: ServiceLocationAuditType.APN_CONFLICT_DETECTED,
          oldValue: { apn: existingApn, detailsStatus: location.detailsStatus },
          newValue: {
            candidateApn: apnValue,
            sourceTitle: apnSourceTitle,
            sourceUrl: apnSourceUrl,
          },
          sourceReason: "ai_conflict_recorded_reviewed_apn_preserved",
        });
      }
      await appendServiceLocationAuditEvent(auditDb, {
        organizationId: ctx.organizationId,
        serviceLocationId: id,
        actorUserId: ctx.userId,
        eventType: ServiceLocationAuditType.AI_VALUE_REJECTED,
        oldValue: { detailsStatus: location.detailsStatus },
        newValue: { preserved: true },
        sourceReason: "reviewed_or_corrected_values_protected",
      });
    }

    const siteDetails = await resolveSiteDetailsForServiceLocation(resolverDb, {
      organizationId: ctx.organizationId,
      serviceLocationId: id,
    });
    // #region agent log
    console.error("[agent-debug] a9eae3 pendingResolved siteDetails", {
      runId: "pre-fix-4",
      hypothesisId: "H12",
      serviceLocationId: id,
      requestedScopes: requested,
      hasSiteDetails: Boolean(siteDetails),
      apn: siteDetails?.apn ?? null,
      utilityName: siteDetails?.utility?.name ?? null,
      jurisdictionName: siteDetails?.jurisdiction?.name ?? null,
      missingScopes: siteDetails?.missingScopes ?? null,
    });
    // #endregion
    await revalidateLocationSurfaces(id);
    return siteDetails;
  })();
  researchInFlightByLocation.set(key, pending);
  try {
    const siteDetails = await pending;
    // #region agent log
    console.error("[agent-debug] a9eae3 actionReturn success", {
      runId: "pre-fix-4",
      hypothesisId: "H12",
      serviceLocationId: id,
      hasSiteDetails: Boolean(siteDetails),
      apn: siteDetails?.apn ?? null,
      utilityName: siteDetails?.utility?.name ?? null,
      jurisdictionName: siteDetails?.jurisdiction?.name ?? null,
      missingScopes: siteDetails?.missingScopes ?? null,
    });
    // #endregion
    return { success: true, siteDetails };
  } catch (error) {
    // #region agent log
    await fetch("http://127.0.0.1:7937/ingest/24410f3e-b077-4c1d-af62-4457af9c97bc", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a9eae3" },
      body: JSON.stringify({
        sessionId: "a9eae3",
        runId: "pre-fix-2",
        hypothesisId: "H10",
        location: "site-details-actions.ts:outerCatch",
        message: "requestSiteDetailsResearchAction caught error",
        data: {
          errorName: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      }),
    }).catch((fetchError) => {
      console.error(
        "[agent-debug] a9eae3 log send failed",
        fetchError instanceof Error ? fetchError.message : String(fetchError),
      );
    });
    // #endregion
    return {
      error: getAiActionErrorMessage(error, "Failed to research site details."),
      success: false,
    };
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
