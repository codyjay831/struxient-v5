"use server";

// TODO: Add server-side rate limiting (per IP / per slug) when traffic warrants it.

import {
  SalesIntakeSource,
  SalesIntakeStatus,
  NeededByBucket,
  Prisma,
  QuoteStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { SALES_INTAKE_FIELD_LIMITS } from "@/app/(workspace)/sales/sales-field-limits";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";
import { effectivePublicRequestSettingsFromRow } from "@/lib/public-request-settings-effective";
import { requestTypeLabelByValue } from "@/lib/public-request-settings-validation";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  sanitizePublicIntakeServiceLocationFromClient,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";
import { performApplyLineItemTemplateToQuoteTx } from "@/lib/quote-line-item-template-apply-tx";
import { notifySalesIntakeSubmitted } from "@/lib/notifications";
import { headers } from "next/headers";

import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 5;

export type PublicSalesIntakeState = {
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

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): PublicSalesIntakeState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/** Same pragmatic rule as internal sales intake create/update. */
function isReasonableEmail(value: string): boolean {
  if (value.length > SALES_INTAKE_FIELD_LIMITS.email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

function buildPublicIntakeNotes(parts: {
  serviceAddress: string;
  preferredTiming: string;
  requestDetails: string;
  requestTypeLabel: string;
}): string {
  return [
    "[Public Intake Form]",
    "",
    "Service / project location:",
    parts.serviceAddress,
    "",
    "Preferred timing:",
    parts.preferredTiming,
    "",
    "Request type:",
    parts.requestTypeLabel,
    "",
    "What you need help with:",
    parts.requestDetails,
  ].join("\n");
}

/**
 * Creates a sales intake for the organization resolved from `companySlug` (re-resolved server-side).
 * `companySlug` must be bound from the server-rendered route param — never from a hidden form field.
 */
export async function submitPublicSalesIntakeAction(
  companySlug: string,
  _prevState: PublicSalesIntakeState,
  formData: FormData,
): Promise<PublicSalesIntakeState> {
  void _prevState;

  const attachmentIdsRaw = trimOrEmpty(formData.get("attachmentIds"));
  const attachmentIds = attachmentIdsRaw ? attachmentIdsRaw.split(",") : [];

  const requestedDateRaw = trimOrNull(formData.get("requestedVisitDate"));
  const requestedWindow = trimOrNull(formData.get("requestedVisitWindow"));
  const visitNotes = trimOrNull(formData.get("requestedVisitNotes"));
  const lockInInstantQuote = formData.get("lockInInstantQuote") === "on";

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!(await checkRateLimit(ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW, keyPrefix: "public-intake" }))) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  const customFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("customField_") && typeof value === "string") {
      const fieldDefId = key.replace("customField_", "");
      customFields[fieldDefId] = value;
    }
  }

  const normalizedSlug = companySlug.trim().toLowerCase();
  if (!isValidPublicCompanySlugSegment(normalizedSlug)) {
    return { error: "We could not send your request. Please check the link and try again." };
  }

  // Honeypot — must stay empty (bots often fill every field). Silent success to avoid training spammers.
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

  const effective = effectivePublicRequestSettingsFromRow(record.publicRequestSettings);
  if (!effective.enabled) {
    return { error: "We could not send your request. Please check the link and try again." };
  }

  const contactName = trimOrEmpty(formData.get("contactName"));
  const email = trimOrEmpty(formData.get("email"));
  const phone = trimOrEmpty(formData.get("phone"));
  const serviceAddress = trimOrEmpty(formData.get("serviceAddress"));
  const preferredTiming = trimOrEmpty(formData.get("preferredTiming"));
  const requestDetails = trimOrEmpty(formData.get("requestDetails"));
  const requestTypeValue = trimOrEmpty(formData.get("requestType"));
  const rawLocationJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));
  const neededByBucketRaw = trimOrEmpty(formData.get("neededByBucket"));
  const neededByDateRaw = trimOrEmpty(formData.get("neededByDate"));

  if (!contactName) {
    return { error: "Please enter your name." };
  }
  if (!email) {
    return { error: "Please enter your email address." };
  }
  if (!isReasonableEmail(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (!phone) {
    return { error: "Please enter a phone number." };
  }
  if (!serviceAddress) {
    return { error: "Please enter the service address or project location." };
  }
  if (!requestDetails) {
    return { error: "Please describe what you need help with." };
  }

  if (rawLocationJson.length > 16_000) {
    return { error: "Your message is too long. Please shorten the description and try again." };
  }

  let publicIntakeServiceLocation: PublicIntakeServiceLocationV1 | null = null;
  if (rawLocationJson.length > 0) {
    try {
      const parsed: unknown = JSON.parse(rawLocationJson);
      const sanitized = sanitizePublicIntakeServiceLocationFromClient(parsed);
      if (sanitized) {
        publicIntakeServiceLocation = sanitized;
      }
    } catch {
      /* Ignore malformed JSON — fall back to manual snapshot from textarea. */
    }
  }
  if (!publicIntakeServiceLocation) {
    publicIntakeServiceLocation = buildManualPublicIntakeSnapshotFromFreeText(serviceAddress);
  }

  for (const [label, value, max] of [
    ["Name", contactName, SALES_INTAKE_FIELD_LIMITS.contactName],
    ["Email", email, SALES_INTAKE_FIELD_LIMITS.email],
    ["Phone", phone, SALES_INTAKE_FIELD_LIMITS.phone],
    ["Service / project location", serviceAddress, SALES_INTAKE_FIELD_LIMITS.publicIntakeServiceAddress],
    ["Preferred timing", preferredTiming, SALES_INTAKE_FIELD_LIMITS.publicIntakePreferredTiming],
    ["Request details", requestDetails, SALES_INTAKE_FIELD_LIMITS.publicIntakeRequestDetails],
  ] as const) {
    const err = enforceMaxLength(label, value, max);
    if (err) {
      return err;
    }
  }

  const requestTypeLabel = requestTypeLabelByValue(effective.requestTypeOptions, requestTypeValue);
  if (requestTypeLabel == null) {
    return { error: "Please choose a valid request type." };
  }

  const notes = buildPublicIntakeNotes({
    serviceAddress,
    preferredTiming,
    requestDetails,
    requestTypeLabel,
  });
  if (notes.length > SALES_INTAKE_FIELD_LIMITS.notes) {
    return { error: "Your message is too long. Please shorten the description and try again." };
  }

  const titleBase = `Public request — ${contactName}`;
  const title =
    titleBase.length > SALES_INTAKE_FIELD_LIMITS.title
      ? `${titleBase.slice(0, SALES_INTAKE_FIELD_LIMITS.title - 1)}…`
      : titleBase;

  const neededByBucket = (Object.values(NeededByBucket) as string[]).includes(neededByBucketRaw) ? (neededByBucketRaw as NeededByBucket) : null;
  const neededByDate = (neededByBucket === "SPECIFIC_DATE" && neededByDateRaw) ? new Date(neededByDateRaw) : null;

  const publicIntakeClientKey = parsePublicIntakeClientKey(trimOrEmpty(formData.get("publicIntakeClientKey")));

  if (publicIntakeClientKey) {
    const existingSalesIntake = await db.salesIntake.findFirst({
      where: {
        organizationId: record.id,
        publicIntakeClientKey,
      },
      select: { id: true },
    });
    if (existingSalesIntake) {
      return { success: true };
    }
  }

  const requestTypeKey = requestTypeValue.trim().toLowerCase();

  // Fuzzy duplicate detection
  const likelyMatches = await db.customer.findMany({
    where: {
      organizationId: record.id,
      OR: [
        { email: { equals: email, mode: 'insensitive' } },
        { phone: { equals: phone } }
      ]
    },
    select: { id: true, displayName: true }
  });

  const duplicateNote = likelyMatches.length > 0 
    ? `\n\n[System] Likely existing customer matches: ${likelyMatches.map(m => m.displayName).join(", ")}`
    : "";

  let createdSalesIntakeId: string | null = null;

  try {
    await db.$transaction(async (tx) => {
      const salesIntake = await tx.salesIntake.create({
        data: {
          organizationId: record.id,
          title,
          contactName,
          email,
          phone,
          source: SalesIntakeSource.PUBLIC_REQUEST_LINK,
          sourceDetail: "Public Intake Form",
          notes: notes + duplicateNote,
          status: SalesIntakeStatus.OPEN,
          publicIntakeServiceLocation:
            publicIntakeServiceLocation as unknown as Prisma.InputJsonValue,
          requestType: requestTypeLabel,
          scopeSummary: requestDetails,
          neededByBucket,
          neededByDate,
          publicIntakeClientKey,
        },
      });
      createdSalesIntakeId = salesIntake.id;

      if (attachmentIds.length > 0) {
        await tx.attachment.updateMany({
          where: {
            id: { in: attachmentIds },
            organizationId: record.id,
            salesIntakeId: null, // Security: only update if not already associated
          },
          data: {
            salesIntakeId: salesIntake.id,
            status: "READY", // Mark as ready when sales intake is submitted
          },
        });
      }

      if (requestedDateRaw || requestedWindow) {
        let requestedDate: Date | null = null;
        if (requestedDateRaw) {
          const d = new Date(requestedDateRaw);
          if (!isNaN(d.getTime())) {
            requestedDate = d;
          }
        }

        await tx.salesVisitRequest.create({
          data: {
            organizationId: record.id,
            salesIntakeId: salesIntake.id,
            requestedDate,
            requestedWindow,
            notes: visitNotes,
          },
        });
      }

      if (lockInInstantQuote && effective.instantQuoteEnabled) {
        const configuredTemplateIds = effective.instantQuoteConfig[requestTypeKey] ?? [];
        const resolvedTemplateIds: string[] = [];
        for (const tid of configuredTemplateIds) {
          const hit = await tx.lineItemTemplate.findFirst({
            where: { id: tid, organizationId: record.id, archivedAt: null },
            select: { id: true },
          });
          if (hit) {
            resolvedTemplateIds.push(hit.id);
          }
        }

        if (resolvedTemplateIds.length > 0) {
          const quote = await tx.quote.create({
            data: {
              organizationId: record.id,
              salesIntakeId: salesIntake.id,
              status: QuoteStatus.DRAFT,
              title: `Instant Quote — ${contactName}`,
              subtotalCents: 0,
              totalCents: 0,
            },
          });

          for (const tid of resolvedTemplateIds) {
            await performApplyLineItemTemplateToQuoteTx(tx, quote.id, tid, record.id);
          }
        }
      }

      for (const [fieldDefId, value] of Object.entries(customFields)) {
        if (value.trim()) {
          await tx.salesCustomFieldValue.create({
            data: {
              salesIntakeId: salesIntake.id,
              fieldDefId,
              value: value.trim(),
            },
          });
        }
      }
    });
  } catch (e) {
    if (isPublicIntakeClientKeyConstraintViolation(e)) {
      return { success: true };
    }
    return {
      error: "We could not send your request right now. Please try again in a few minutes.",
    };
  }

  // Non-blocking notification
  if (createdSalesIntakeId) {
    void notifySalesIntakeSubmitted({
      organizationId: record.id,
      salesIntakeId: createdSalesIntakeId,
      contactName,
      email,
      phone,
      requestType: requestTypeLabel,
    });
  }

  return { success: true };
}
