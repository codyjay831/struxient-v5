import { LeadChannel, NeededByBucket } from "@prisma/client";
import type { LeadInput } from "@/lib/schemas/lead-input";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  sanitizePublicIntakeServiceLocationFromClient,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-lead-service-location";

export type IntakeSurfaceMode = "public" | "staff";

export type IntakeRequestTypeOptionLike = {
  value: string;
  label: string;
};

type MapIntakeFormDataToLeadInputParams = {
  formData: FormData;
  surfaceMode: IntakeSurfaceMode;
  fallbackChannel: LeadChannel;
  requestTypeOptions?: IntakeRequestTypeOptionLike[];
  requireRequestTypeMatch?: boolean;
  publicClientKey?: string | null;
  instantQuoteTemplateIds?: string[];
};

type MapOk = {
  ok: true;
  input: LeadInput;
  requestTypeValue: string;
  formDefinitionId: string | null;
  lockInInstantQuote: boolean;
};

type MapErr = {
  ok: false;
  error: string;
};

export type MapIntakeFormDataToLeadInputResult = MapOk | MapErr;

function trimOrEmpty(value: FormDataEntryValue | null): string {
  if (value == null || typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function trimOrNull(value: FormDataEntryValue | null): string | null {
  const trimmed = trimOrEmpty(value);
  return trimmed.length > 0 ? trimmed : null;
}

function parseChannel(raw: string, fallback: LeadChannel): LeadChannel {
  if (raw.length === 0) {
    return fallback;
  }
  const values = new Set<string>(Object.values(LeadChannel));
  if (!values.has(raw)) {
    return fallback;
  }
  return raw as LeadChannel;
}

function parseNeededByBucket(raw: string): NeededByBucket | null {
  if (!raw) {
    return null;
  }
  const values = new Set<string>(Object.values(NeededByBucket));
  if (!values.has(raw)) {
    return null;
  }
  return raw as NeededByBucket;
}

function parseDate(raw: string): Date | null {
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function deriveTitle(surfaceMode: IntakeSurfaceMode, contactName: string): string {
  const suffix = contactName || "New contact";
  if (surfaceMode === "public") {
    return `Public request - ${suffix}`;
  }
  return `Office intake - ${suffix}`;
}

function collectCustomFields(formData: FormData): Record<string, string> {
  const customFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("customField_") || typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const fieldDefId = key.slice("customField_".length);
    if (fieldDefId) {
      customFields[fieldDefId] = trimmed;
    }
  }
  return customFields;
}

function collectAttachmentIds(formData: FormData): string[] {
  const raw = trimOrEmpty(formData.get("attachmentIds"));
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectSuggestedTemplateIds(formData: FormData): string[] {
  const raw = trimOrEmpty(formData.get("suggestedTemplateIds"));
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function mapRequestType(
  requestTypeValue: string,
  options: IntakeRequestTypeOptionLike[] | undefined,
  requireMatch: boolean,
): { ok: true; label: string | null } | { ok: false; error: string } {
  if (!requestTypeValue) {
    return { ok: true, label: null };
  }
  if (!options || options.length === 0) {
    return { ok: true, label: requestTypeValue };
  }
  const normalized = requestTypeValue.trim().toLowerCase();
  const match = options.find((option) => option.value === normalized);
  if (!match && requireMatch) {
    return { ok: false, error: "Please choose a valid request type." };
  }
  return { ok: true, label: match?.label ?? requestTypeValue };
}

function parseAddress(formData: FormData) {
  const serviceAddress = trimOrEmpty(formData.get("serviceAddress"));
  const rawLocationJson = trimOrEmpty(formData.get("publicIntakeServiceLocation"));

  let structured = null;
  if (rawLocationJson.length > 0) {
    try {
      const parsed = JSON.parse(rawLocationJson) as unknown;
      structured = sanitizePublicIntakeServiceLocationFromClient(parsed);
    } catch {
      structured = null;
    }
  }
  if (!structured) {
    structured = buildManualPublicIntakeSnapshotFromFreeText(serviceAddress);
  }

  return {
    serviceAddress,
    structured,
  };
}

function toLeadInputAddress(
  structured: PublicIntakeServiceLocationV1 | null,
): LeadInput["address"] {
  if (!structured) {
    return undefined;
  }
  return {
    formattedAddress: structured.formattedAddress,
    addressLine1: structured.addressLine1,
    addressLine2: structured.addressLine2,
    city: structured.city,
    state: structured.state,
    postalCode: structured.postalCode,
    country: structured.country,
    googlePlaceId: structured.googlePlaceId,
    latitude: structured.latitude ?? undefined,
    longitude: structured.longitude ?? undefined,
  };
}

function buildPublicNotes(args: {
  serviceAddress: string;
  requestTypeLabel: string | null;
  scope: string;
}): string {
  return [
    "[Public Intake Form]",
    "",
    "Service / project location:",
    args.serviceAddress,
    "",
    "Request type:",
    args.requestTypeLabel ?? "",
    "",
    "What you need help with:",
    args.scope,
  ].join("\n");
}

export function mapIntakeFormDataToLeadInput({
  formData,
  surfaceMode,
  fallbackChannel,
  requestTypeOptions,
  requireRequestTypeMatch = false,
  publicClientKey,
  instantQuoteTemplateIds,
}: MapIntakeFormDataToLeadInputParams): MapIntakeFormDataToLeadInputResult {
  const contactName = trimOrEmpty(formData.get("contactName"));
  const email = trimOrNull(formData.get("email"));
  const phone = trimOrNull(formData.get("phone"));
  const requestDetails = trimOrEmpty(formData.get("requestDetails"));
  const requestTypeValue = trimOrEmpty(formData.get("requestType")).toLowerCase();
  const neededByBucketRaw = trimOrEmpty(formData.get("neededByBucket"));
  const neededByDateRaw = trimOrEmpty(formData.get("neededByDate"));

  const requestedVisitDate = trimOrEmpty(formData.get("requestedVisitDate"));
  const requestedVisitWindow = trimOrNull(formData.get("requestedVisitWindow"));
  const requestedVisitNotes = trimOrNull(formData.get("requestedVisitNotes"));
  const lockInInstantQuote = formData.get("lockInInstantQuote") === "on";
  const formDefinitionId = trimOrNull(formData.get("formDefinitionId"));

  if (surfaceMode === "public" && requestTypeValue.length === 0) {
    return { ok: false, error: "Please select what you need help with." };
  }

  const typeMap = mapRequestType(
    requestTypeValue,
    requestTypeOptions,
    requireRequestTypeMatch,
  );
  if (!typeMap.ok) {
    return typeMap;
  }

  const address = parseAddress(formData);
  const attachmentIds = collectAttachmentIds(formData);
  const suggestedTemplateIds = collectSuggestedTemplateIds(formData);
  const customFields = collectCustomFields(formData);
  const requestedDate = parseDate(requestedVisitDate);
  const neededByDate = parseDate(neededByDateRaw);
  const neededByBucket = parseNeededByBucket(neededByBucketRaw);

  const sourceRaw = trimOrEmpty(formData.get("source"));
  const sourceDetail = trimOrNull(formData.get("sourceDetail"));
  const internalNote = trimOrNull(formData.get("internalNote"));
  const channel = parseChannel(sourceRaw, fallbackChannel);

  const notes =
    surfaceMode === "public"
      ? buildPublicNotes({
          serviceAddress: address.serviceAddress,
          requestTypeLabel: typeMap.label,
          scope: requestDetails,
        })
      : internalNote;

  const input: LeadInput = {
    title: deriveTitle(surfaceMode, contactName),
    contact: {
      name: contactName || null,
      email,
      phone,
    },
    request: {
      type: typeMap.label,
      neededByBucket,
      neededByDate,
      scope: requestDetails || null,
      suggestedTemplateIds,
      lockInInstantQuote: lockInInstantQuote || undefined,
      instantQuoteTemplateIds,
    },
    address: toLeadInputAddress(address.structured),
    channel,
    sourceDetail:
      surfaceMode === "public" ? "Public Intake Form" : sourceDetail,
    notes,
    publicClientKey: publicClientKey ?? undefined,
    attachmentIds,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    visitRequest:
      requestedDate || requestedVisitWindow
        ? {
            requestedDate,
            requestedWindow: requestedVisitWindow,
            notes: requestedVisitNotes,
          }
        : undefined,
  };

  return {
    ok: true,
    input,
    requestTypeValue,
    formDefinitionId,
    lockInInstantQuote,
  };
}
