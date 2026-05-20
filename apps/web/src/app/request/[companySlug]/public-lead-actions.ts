"use server";

import { LeadChannel, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidPublicCompanySlugSegment } from "@/lib/public-request-slug";
import { effectivePublicRequestSettingsFromRow } from "@/lib/public-request-settings-effective";
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
import { isSyntheticIntakeFormDefinitionId } from "@/lib/intake/default-intake-form";
import { ingestLead } from "@/lib/lead/ingest-lead";
import { mapIntakeFormDataToLeadInput } from "@/lib/intake/map-intake-form-data-to-lead-input";
import { resolvePublicFormRequestTypeOptions } from "@/lib/intake/public-intake-request-types";

export async function submitPublicLeadAction(
  companySlug: string,
  _prevState: PublicLeadState,
  formData: FormData,
): Promise<PublicLeadState> {
  const publicIntakeClientKey = trimOrEmpty(formData.get("publicIntakeClientKey"));
  const formDefinitionId = trimOrNull(formData.get("formDefinitionId"));

  let validatedFormDefOrgId: string | null = null;

  // 1. Validate formDefinitionId if present (skip synthetic in-memory fallback id)
  if (formDefinitionId && !isSyntheticIntakeFormDefinitionId(formDefinitionId)) {
    const formDef = await db.intakeFormDefinition.findFirst({
      where: {
        id: formDefinitionId,
        archivedAt: null,
        channel: "WEB_FORM",
        isPublic: true,
      },
      select: { organizationId: true },
    });

    if (!formDef) {
      console.error(`[submitPublicLeadAction] Invalid public formDefinitionId: ${formDefinitionId}`);
      return { error: "We could not send your request. Please check the link and try again." };
    }

    validatedFormDefOrgId = formDef.organizationId;
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

  let submitTriageRules: unknown = null;
  if (formDefinitionId && !isSyntheticIntakeFormDefinitionId(formDefinitionId)) {
    const formForTypes = await db.intakeFormDefinition.findFirst({
      where: {
        id: formDefinitionId,
        organizationId: record.id,
        archivedAt: null,
        channel: LeadChannel.WEB_FORM,
        isPublic: true,
      },
      select: { triageRules: true },
    });
    if (!formForTypes) {
      return { error: "We could not send your request. Please check the link and try again." };
    }
    submitTriageRules = formForTypes.triageRules;
  }

  const requestTypeOptions = resolvePublicFormRequestTypeOptions(
    submitTriageRules,
    record.publicRequestSettings?.requestTypeOptionsJson,
  );

  const requestTypeRaw = trimOrEmpty(formData.get("requestType"));
  if (!requestTypeRaw) {
    return { error: "Please select what you need help with." };
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

  const mapped = mapIntakeFormDataToLeadInput({
    formData,
    surfaceMode: "public",
    fallbackChannel: LeadChannel.WEB_FORM,
    requestTypeOptions,
    requireRequestTypeMatch: true,
    publicClientKey: parsedClientKey,
  });
  if (!mapped.ok) {
    return { error: mapped.error };
  }
  const instantQuoteTemplateIds =
    mapped.lockInInstantQuote && effective.instantQuoteEnabled
      ? effective.instantQuoteConfig[mapped.requestTypeValue]
      : undefined;
  mapped.input.request.instantQuoteTemplateIds = instantQuoteTemplateIds;

  try {
    await ingestLead(mapped.input, {
      organizationId: record.id,
      formSnapshot:
        mapped.formDefinitionId &&
        !isSyntheticIntakeFormDefinitionId(mapped.formDefinitionId)
          ? { formDefinitionId: mapped.formDefinitionId, capturedAt: new Date().toISOString() }
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
