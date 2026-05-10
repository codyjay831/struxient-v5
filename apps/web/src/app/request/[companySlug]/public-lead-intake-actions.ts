"use server";

// TODO: Add server-side rate limiting (per IP / per slug) when traffic warrants it.

import { LeadSource, LeadStatus, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LEAD_FIELD_LIMITS } from "@/app/(workspace)/leads/lead-field-limits";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";
import { effectivePublicRequestSettingsFromRow } from "@/lib/public-request-settings-effective";
import { requestTypeLabelByValue } from "@/lib/public-request-settings-validation";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  sanitizePublicIntakeServiceLocationFromClient,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";

export type PublicLeadIntakeState = {
  error?: string;
  success?: boolean;
};

function trimOrEmpty(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function enforceMaxLength(
  label: string,
  value: string,
  max: number,
): PublicLeadIntakeState | null {
  if (value.length > max) {
    return { error: `${label} is too long (max ${max} characters).` };
  }
  return null;
}

/** Same pragmatic rule as internal lead create/update. */
function isReasonableEmail(value: string): boolean {
  if (value.length > LEAD_FIELD_LIMITS.email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
 * Creates a lead for the organization resolved from `companySlug` (re-resolved server-side).
 * `companySlug` must be bound from the server-rendered route param — never from a hidden form field.
 */
export async function submitPublicLeadIntakeAction(
  companySlug: string,
  _prevState: PublicLeadIntakeState,
  formData: FormData,
): Promise<PublicLeadIntakeState> {
  void _prevState;

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
  if (!preferredTiming) {
    return { error: "Please tell us your preferred timing." };
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
    ["Name", contactName, LEAD_FIELD_LIMITS.contactName],
    ["Email", email, LEAD_FIELD_LIMITS.email],
    ["Phone", phone, LEAD_FIELD_LIMITS.phone],
    ["Service / project location", serviceAddress, LEAD_FIELD_LIMITS.publicIntakeServiceAddress],
    ["Preferred timing", preferredTiming, LEAD_FIELD_LIMITS.publicIntakePreferredTiming],
    ["Request details", requestDetails, LEAD_FIELD_LIMITS.publicIntakeRequestDetails],
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
  if (notes.length > LEAD_FIELD_LIMITS.notes) {
    return { error: "Your message is too long. Please shorten the description and try again." };
  }

  const titleBase = `Public request — ${contactName}`;
  const title =
    titleBase.length > LEAD_FIELD_LIMITS.title
      ? `${titleBase.slice(0, LEAD_FIELD_LIMITS.title - 1)}…`
      : titleBase;

  try {
    await db.lead.create({
      data: {
        organizationId: record.id,
        title,
        contactName,
        email,
        phone,
        source: LeadSource.PUBLIC_REQUEST_LINK,
        sourceDetail: "Public Intake Form",
        notes,
        status: LeadStatus.OPEN,
        publicIntakeServiceLocation:
          publicIntakeServiceLocation as unknown as Prisma.InputJsonValue,
      },
    });
  } catch {
    return {
      error: "We could not send your request right now. Please try again in a few minutes.",
    };
  }

  return { success: true };
}
