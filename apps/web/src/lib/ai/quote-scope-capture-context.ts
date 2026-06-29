import type { CommercialContext } from "@/lib/ai/commercial-context";

export const QUOTE_SCOPE_CONTEXT_SOURCE_TYPES = [
  "LEAD_REQUEST",
  "CUSTOMER_NOTES",
  "COMPANY_INTAKE_NOTES",
  "QUOTE_INTERNAL_NOTES",
  "SALES_SITE_VISIT_NOTES",
] as const;

export type QuoteScopeContextSourceType =
  (typeof QUOTE_SCOPE_CONTEXT_SOURCE_TYPES)[number];

export type QuoteScopeContextVisibility =
  | "CUSTOMER_STATED"
  | "STAFF_ONLY"
  | "SYSTEM_GENERATED"
  | "DERIVED";

export type QuoteScopeContextSection = {
  sourceType: QuoteScopeContextSourceType;
  label: string;
  body: string;
  sourceId: string | null;
  sourceModel: string | null;
  visibility: QuoteScopeContextVisibility;
  isEmpty: boolean;
  isIncluded: boolean;
  requiresSave: boolean;
  emptyLabel?: string;
  updatedAtIso?: string;
  authorName?: string;
};

export type BuildQuoteScopeCaptureContextInput = {
  captureText?: string | null;
  additionalInstructions?: string | null;
  commercialContext: CommercialContext;
  selectedSourceTypes?: QuoteScopeContextSourceType[];
  priorMissingInfo?: string[];
};

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dedupeNonEmpty(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = trimOrNull(value);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function makeSection(
  input: Omit<QuoteScopeContextSection, "body" | "isEmpty" | "isIncluded"> & {
    body?: string | null;
    defaultIncluded?: boolean;
  },
): QuoteScopeContextSection {
  const body = trimOrNull(input.body) ?? "";
  const isEmpty = body.length === 0;
  const defaultIncluded = input.defaultIncluded ?? true;
  return {
    sourceType: input.sourceType,
    label: input.label,
    body,
    sourceId: input.sourceId,
    sourceModel: input.sourceModel,
    visibility: input.visibility,
    isEmpty,
    isIncluded: !isEmpty && defaultIncluded,
    requiresSave: input.requiresSave,
    emptyLabel: input.emptyLabel,
    updatedAtIso: input.updatedAtIso,
    authorName: input.authorName,
  };
}

function leadRequestBody(context: CommercialContext): string | null {
  const parts: string[] = [];
  const requestType = trimOrNull(context.leadRequest?.requestType);
  const scope = trimOrNull(context.leadRequest?.scopeSummary);
  const neededBy = trimOrNull(context.leadRequest?.neededByBucket);
  const neededByDate = trimOrNull(context.leadRequest?.neededByDateIso);

  if (requestType) {
    parts.push(`Request type: ${requestType}`);
  }
  if (scope) {
    parts.push(`Requested work:\n${scope}`);
  }
  if (neededBy) {
    parts.push(`Needed by: ${neededBy}`);
  }
  if (neededByDate) {
    parts.push(`Needed by date: ${neededByDate}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function companyIntakeNotesBody(context: CommercialContext): string | null {
  if (context.leadNotes?.isPublicIntake) {
    return null;
  }
  return trimOrNull(context.leadNotes?.internalSalesNotes);
}

function salesSiteVisitNotesBody(context: CommercialContext): string | null {
  const latestVisit = context.latestVisit;
  if (!latestVisit) return null;
  const parts: string[] = [];
  const requestedNotes = trimOrNull(latestVisit.notes);
  const completionNotes = trimOrNull(latestVisit.outcomeNotes);
  if (requestedNotes) {
    parts.push(`Visit request notes:\n${requestedNotes}`);
  }
  if (completionNotes) {
    parts.push(`Visit completion notes:\n${completionNotes}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export function buildQuoteScopeContextSections(
  commercialContext: CommercialContext,
  options?: { selectedSourceTypes?: readonly QuoteScopeContextSourceType[] },
): QuoteScopeContextSection[] {
  const selected = options?.selectedSourceTypes
    ? new Set(options.selectedSourceTypes)
    : null;
  const include = (sourceType: QuoteScopeContextSourceType) =>
    selected ? selected.has(sourceType) : true;
  const context = commercialContext;
  const sections: QuoteScopeContextSection[] = [];

  sections.push(
    makeSection({
      sourceType: "LEAD_REQUEST",
      label: "Lead request / requested work",
      body: leadRequestBody(context),
      sourceId: context.leadId,
      sourceModel: context.leadId ? "Lead.request" : null,
      visibility: "CUSTOMER_STATED",
      requiresSave: false,
      emptyLabel: "No requested work saved.",
      defaultIncluded: include("LEAD_REQUEST"),
    }),
  );

  if (context.customer.id) {
    sections.push(
      makeSection({
        sourceType: "CUSTOMER_NOTES",
        label: "Customer notes",
        body: context.customer.notes,
        sourceId: context.customer.id,
        sourceModel: "Customer.notes",
        visibility: "STAFF_ONLY",
        requiresSave: false,
        emptyLabel: "No customer notes saved.",
        defaultIncluded: include("CUSTOMER_NOTES"),
      }),
    );
  }

  sections.push(
    makeSection({
      sourceType: "COMPANY_INTAKE_NOTES",
      label: "Company intake notes",
      body: companyIntakeNotesBody(context),
      sourceId: context.leadId,
      sourceModel: context.leadId ? "Lead.signals.notes" : null,
      visibility: "STAFF_ONLY",
      requiresSave: false,
      emptyLabel: "No company intake notes saved.",
      defaultIncluded: include("COMPANY_INTAKE_NOTES"),
    }),
  );

  sections.push(
    makeSection({
      sourceType: "QUOTE_INTERNAL_NOTES",
      label: "Internal quote notes",
      body: context.quote.internalNotes,
      sourceId: context.quoteId,
      sourceModel: "Quote.internalNotes",
      visibility: "STAFF_ONLY",
      requiresSave: true,
      emptyLabel: "No internal quote notes saved.",
      defaultIncluded: include("QUOTE_INTERNAL_NOTES"),
    }),
  );

  const latestVisit = context.latestVisit;
  sections.push(
    makeSection({
      sourceType: "SALES_SITE_VISIT_NOTES",
      label: "Sales site visit notes",
      body: salesSiteVisitNotesBody(context),
      sourceId: latestVisit?.id ?? null,
      sourceModel: latestVisit ? "LeadVisitRequest" : null,
      visibility: "STAFF_ONLY",
      requiresSave: false,
      emptyLabel: "No sales site visit notes saved.",
      updatedAtIso:
        latestVisit?.completedAtIso ??
        latestVisit?.confirmedDateIso ??
        latestVisit?.requestedDateIso ??
        undefined,
      defaultIncluded: include("SALES_SITE_VISIT_NOTES"),
    }),
  );

  return sections.filter(
    (section) =>
      !section.isEmpty ||
      section.sourceType === "LEAD_REQUEST" ||
      section.sourceType === "CUSTOMER_NOTES" ||
      section.sourceType === "QUOTE_INTERNAL_NOTES",
  );
}

export function applyQuoteScopeContextSelection(
  sections: readonly QuoteScopeContextSection[],
  selectedSourceTypes?: readonly QuoteScopeContextSourceType[],
): QuoteScopeContextSection[] {
  if (!selectedSourceTypes) return sections.map((section) => ({ ...section }));
  const selected = new Set(selectedSourceTypes);
  return sections.map((section) => ({
    ...section,
    isIncluded: !section.isEmpty && selected.has(section.sourceType),
  }));
}

export function serializeQuoteScopeContextSectionsForAi(
  sections: readonly QuoteScopeContextSection[],
): string | undefined {
  const included = sections
    .filter((section) => section.isIncluded && !section.isEmpty)
    .map((section) => {
      const visibilityLabel = section.visibility.toLowerCase().replaceAll("_", " ");
      return `${section.label} (${visibilityLabel}):\n${section.body.trim()}`;
    });
  const merged = included.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : undefined;
}

/**
 * Builds AI context for Quick scope capture from user input and explicit saved source sections.
 */
export function buildQuoteScopeCaptureContext(
  input: BuildQuoteScopeCaptureContextInput,
): string | undefined {
  const savedSections = buildQuoteScopeContextSections(input.commercialContext, {
    selectedSourceTypes: input.selectedSourceTypes,
  });
  const sections: string[] = [];

  const captureText = trimOrNull(input.captureText);
  if (captureText) {
    sections.push(`Quick Scope typed/pasted work description:\n${captureText}`);
  }

  const additionalInstructions = trimOrNull(input.additionalInstructions);
  if (additionalInstructions) {
    sections.push(`Additional Quick Scope instructions:\n${additionalInstructions}`);
  }

  const savedContext = serializeQuoteScopeContextSectionsForAi(savedSections);
  if (savedContext) {
    sections.push(savedContext);
  }

  const priorMissing = dedupeNonEmpty(input.priorMissingInfo ?? []);
  if (priorMissing.length > 0) {
    const detail = priorMissing.map((item) => `- ${item}`).join("\n");
    sections.push(`Previously flagged missing context:\n${detail}`);
  }

  const merged = sections.join("\n\n---\n\n").trim();
  return merged.length > 0 ? merged : undefined;
}
