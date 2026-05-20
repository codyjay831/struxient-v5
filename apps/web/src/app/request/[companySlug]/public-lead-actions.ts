"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";
import { effectivePublicRequestSettingsFromRow } from "@/lib/public-request-settings-effective";
import { requestTypeLabelByValue } from "@/lib/public-request-settings-validation";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  sanitizePublicIntakeServiceLocationFromClient,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-lead-service-location";
import { headers } from "next/headers";

import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 5;

export type PublicLeadState = {
  error?: string;
  success?: boolean;
};

function trimOrEmpty(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** `crypto.randomUUID()` shape — used only for public intake dedupe. */
const PUBLIC_INTAKE_CLIENT_KEY_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePublicIntakeClientKey(raw: string): string | null {
  const t = raw.trim();
  if (!PUBLIC_INTAKE_CLIENT_KEY_RE.test(t)) {
    return null;
  }
  return t.toLowerCase();
}

function isPublicIntakeClientKeyConstraintViolation(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
    return false;
  }
  const target = e.meta?.target;
  if (Array.isArray(target)) {
    return target.some((x) => String(x).includes("publicIntakeClientKey"));
  }
  return String(target ?? "").includes("publicIntakeClientKey");
}

/**
 * Creates a lead for the organization resolved from `companySlug` (re-resolved server-side).
 * `companySlug` must be bound from the server-rendered route param — never from a hidden form field.
 */
import { isSyntheticDefaultIntakeFormDefinitionId } from "@/lib/intake/default-intake-form";
import { ingestLead } from "@/lib/lead/ingest-lead";
import { WebFormAdapter } from "@/lib/lead/channels/web-form-adapter";

export async function submitPublicLeadAction(
  companySlug: string,
  _prevState: PublicLeadState,
  formData: FormData,
): Promise<PublicLeadState> {
  const contactName = trimOrEmpty(formData.get("contactName"));
  const email = trimOrEmpty(formData.get("email"));
  const phone = trimOrEmpty(formData.get("phone"));
  const publicIntakeClientKey = trimOrEmpty(formData.get("publicIntakeClientKey"));

  const attachmentIdsRaw = trimOrEmpty(formData.get("attachmentIds"));
  const attachmentIds = attachmentIdsRaw
    ? attachmentIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const requestedDateRaw = trimOrNull(formData.get("requestedVisitDate"));
  const requestedWindow = trimOrNull(formData.get("requestedVisitWindow"));
  const visitNotes = trimOrNull(formData.get("requestedVisitNotes"));
  const lockInInstantQuote = formData.get("lockInInstantQuote") === "on";
  const formDefinitionId = trimOrNull(formData.get("formDefinitionId"));

  let validatedFormDefOrgId: string | null = null;

  // 1. Validate formDefinitionId if present (skip synthetic in-memory fallback id)
  if (formDefinitionId && !isSyntheticDefaultIntakeFormDefinitionId(formDefinitionId)) {
    const formDef = await db.intakeFormDefinition.findFirst({
      where: {
        id: formDefinitionId,
        isPublic: true,
        archivedAt: null,
      },
      select: { organizationId: true },
    });

    if (!formDef) {
      console.error(`[submitPublicLeadAction] Invalid formDefinitionId: ${formDefinitionId}`);
      return { error: "We could not send your request. Please check the link and try again." };
    }

    // We'll verify organizationId matches the resolved record later.
    // Store it for the final check.
    validatedFormDefOrgId = formDef.organizationId;
  }

  const customFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("customField_") || typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    const fieldDefId = key.slice("customField_".length);
    if (fieldDefId) {
      customFields[fieldDefId] = trimmed;
    }
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!(await checkRateLimit(ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW, keyPrefix: "public-intake" }))) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  const normalizedSlug = companySlug.trim().toLowerCase();
  if (!isValidPublicCompanySlugSegment(normalizedSlug)) {
    return { error: "We could not send your request. Please check the link and try again." };
  }

  // Honeypot
  const honeypot = trimOrEmpty(formData.get("companyWebsite"));
  if (honeypot.length > 0) {
    return { success: true };
  }

  const record = await db.organization.findFirst({
    where: { slug: normalizedSlug },
    select: {
      id: true,
      publicRequestSettings: {
        select: {
          enabled: true,
          formTitle: true,
          introMessage: true,
          emergencyWarningText: true,
          submitButtonText: true,
          requestTypeOptionsJson: true,
          instantQuoteConfigJson: true,
          instantQuoteEnabled: true,
          showInstantQuoteDetails: true,
          offerings: true,
        },
      },
    },
  });
  if (!record) {
    return { error: "We could not send your request. Please check the link and try again." };
  }

  // 2. Verify formDefinitionId belongs to this organization
  if (validatedFormDefOrgId && validatedFormDefOrgId !== record.id) {
    console.error(`[submitPublicLeadAction] formDefinitionId ${formDefinitionId} does not belong to organization ${record.id}`);
    return { error: "We could not send your request. Please check the link and try again." };
  }

  const effective = effectivePublicRequestSettingsFromRow(record.publicRequestSettings);
  if (!effective.enabled) {
    return { error: "We could not send your request. Please check the link and try again." };
  }

  const serviceAddress = trimOrEmpty(formData.get("serviceAddress"));
  const preferredTiming = trimOrEmpty(formData.get("preferredTiming"));
  const requestDetails = trimOrEmpty(formData.get("requestDetails"));
  const requestTypeValue = trimOrEmpty(formData.get("requestType"));
  const rawLocationJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));
  const neededByBucketRaw = trimOrEmpty(formData.get("neededByBucket"));
  const neededByDateRaw = trimOrEmpty(formData.get("neededByDate"));

  const requestTypeLabel = requestTypeLabelByValue(effective.requestTypeOptions, requestTypeValue);
  if (requestTypeLabel == null) {
    console.error(`[submitPublicLeadAction] Invalid requestType: ${requestTypeValue}`);
    return { error: "Please choose a valid request type." };
  }

  const parsedClientKey = parsePublicIntakeClientKey(publicIntakeClientKey);

  if (parsedClientKey) {
    const existingLead = await db.lead.findFirst({
      where: {
        organizationId: record.id,
        publicClientKey: parsedClientKey,
      },
      select: { id: true },
    });
    if (existingLead) {
      return { success: true };
    }
  }

  const requestTypeKey = requestTypeValue.trim().toLowerCase();
  const instantQuoteTemplateIds = lockInInstantQuote && effective.instantQuoteEnabled 
    ? effective.instantQuoteConfig[requestTypeKey] 
    : undefined;

  let publicIntakeServiceLocation: PublicIntakeServiceLocationV1 | null = null;
  if (rawLocationJson.length > 0) {
    try {
      const parsed: unknown = JSON.parse(rawLocationJson);
      const sanitized = sanitizePublicIntakeServiceLocationFromClient(parsed);
      if (sanitized) {
        publicIntakeServiceLocation = sanitized;
      }
    } catch {}
  }
  if (!publicIntakeServiceLocation) {
    publicIntakeServiceLocation = buildManualPublicIntakeSnapshotFromFreeText(serviceAddress);
  }

  const adapter = new WebFormAdapter();
  const input = adapter.parse({
    contactName,
    email,
    phone,
    serviceAddress,
    preferredTiming,
    requestDetails,
    requestTypeLabel,
    publicIntakeServiceLocation,
    neededByBucket: neededByBucketRaw,
    neededByDate: neededByDateRaw,
    publicIntakeClientKey: parsedClientKey,
    attachmentIds,
    requestedVisitDate: requestedDateRaw,
    requestedVisitWindow: requestedWindow,
    requestedVisitNotes: visitNotes,
    lockInInstantQuote,
    instantQuoteTemplateIds,
  });

  if (Object.keys(customFields).length > 0) {
    input.customFields = customFields;
  }

  try {
    await ingestLead(input, {
      organizationId: record.id,
      formSnapshot:
        formDefinitionId && !isSyntheticDefaultIntakeFormDefinitionId(formDefinitionId)
          ? { formDefinitionId, capturedAt: new Date().toISOString() }
          : undefined,
    });
    return { success: true };
  } catch (e) {
    if (isPublicIntakeClientKeyConstraintViolation(e)) {
      return { success: true };
    }
    console.error("[submitPublicLeadAction] ingestLead failed", e);
    return { error: "We could not send your request right now. Please try again in a few minutes." };
  }
}
