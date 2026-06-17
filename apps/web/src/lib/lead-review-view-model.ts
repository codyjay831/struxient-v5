import type { LeadChannel, LeadVisitRequestStatus, NeededByBucket } from "@prisma/client";
import {
  evaluateLeadReadiness,
  type LeadReadinessReport,
} from "@/lib/lead-readiness-heuristics";
import {
  formatLeadChannel,
  formatLeadUrgencyHint,
  formatNeededByTiming,
  parseIntakeNotes,
} from "@/lib/lead-display";
import { readRequest, readSignals, type LeadRequestJson, type LeadSignalsJson } from "@/lib/lead/lead-projection";

export type LeadReviewRequirementKey = "identity" | "email" | "phone" | "location";

export type LeadReviewRequirementRow = {
  key: LeadReviewRequirementKey;
  label: string;
  satisfied: boolean;
  fixHref: string;
};

export type LeadReviewRequestField = {
  label: string;
  value: string;
};

export type LeadReviewAttachmentRow = {
  id: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  downloadHref: string;
};

export type LeadReviewActivityRow = {
  id: string;
  label: string;
  detail?: string;
  createdAt: Date;
};

export type LeadReviewVisitRow = {
  id: string;
  status: LeadVisitRequestStatus;
  summary: string;
  notes: string | null;
};

export type LeadReviewViewModel = {
  requestFields: LeadReviewRequestField[];
  scopeText: string | null;
  showLegacyNotes: boolean;
  legacyNotesPreview: string | null;
  requirements: LeadReviewRequirementRow[];
  allRequirementsMet: boolean;
  attachments: LeadReviewAttachmentRow[];
  activity: LeadReviewActivityRow[];
  visits: LeadReviewVisitRow[];
};

export type BuildLeadReviewViewModelInput = {
  leadId: string;
  channel: LeadChannel;
  notes: string | null;
  requestType: string | null;
  scopeSummary: string | null;
  neededByBucket: NeededByBucket | null;
  neededByDate: Date | string | null;
  requestJson: LeadRequestJson;
  signalsJson: LeadSignalsJson;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  jobsiteAddressLine: string | null;
  isAddressVerified: boolean;
  readiness?: LeadReadinessReport;
  attachments: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    contentType: string;
  }>;
  events: Array<{
    id: string;
    type: string;
    payload: unknown;
    createdAt: Date;
  }>;
  visitRequests: Array<{
    id: string;
    status: LeadVisitRequestStatus;
    requestedDate: Date | null;
    requestedWindow: string | null;
    confirmedDate?: Date | null;
    completedAt?: Date | null;
    purpose?: string | null;
    notes: string | null;
  }>;
  /** Unused for logic; kept for future embed copy if needed. */
};

const REQUIREMENT_DEFS: { key: LeadReviewRequirementKey; label: string; check: (r: LeadReadinessReport) => boolean }[] = [
  { key: "identity", label: "Identity", check: (r) => r.hasIdentity },
  { key: "email", label: "Email", check: (r) => r.hasEmail },
  { key: "phone", label: "Phone", check: (r) => r.hasPhone },
  { key: "location", label: "Location", check: (r) => r.hasAddress },
];

function formatVisitSummary(v: BuildLeadReviewViewModelInput["visitRequests"][number]): string {
  const parts: string[] = [];
  if (v.status === "COMPLETED" && v.completedAt) {
    parts.push(`Completed ${v.completedAt.toLocaleDateString()}`);
  } else if (v.status === "CONFIRMED" && v.confirmedDate) {
    parts.push(`Scheduled ${v.confirmedDate.toLocaleString()}`);
  } else if (v.requestedDate) {
    parts.push(`Requested ${v.requestedDate.toLocaleDateString()}`);
  } else {
    parts.push("Site visit requested");
  }
  if (v.purpose?.trim()) parts.push(v.purpose.trim().toLowerCase().replaceAll("_", " "));
  if (v.requestedWindow?.trim()) parts.push(v.requestedWindow.trim());
  return parts.join(" · ");
}

/** Safe human-readable event line — never exposes raw payload JSON. */
export function summarizeLeadEvent(type: string, payload: unknown): { label: string; detail?: string } {
  switch (type) {
    case "CREATED":
      return { label: "Request received", detail: "New lead created from intake." };
    case "UPDATED":
      return { label: "Lead updated", detail: "Contact or request details changed." };
    case "STATUS_CHANGED": {
      const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const to =
        typeof p.to === "string"
          ? p.to
          : typeof p.status === "string"
            ? p.status
            : null;
      return {
        label: "Pipeline tag changed",
        detail: to ? `Status set to ${to.replaceAll("_", " ").toLowerCase()}.` : undefined,
      };
    }
    case "CLOSED_OR_PAUSED": {
      const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      const status = typeof p.status === "string" ? p.status : null;
      const closeReason = typeof p.closeReason === "string" ? p.closeReason : null;
      return {
        label: "Opportunity closed or paused",
        detail: status
          ? closeReason
            ? `Set to ${status.replaceAll("_", " ").toLowerCase()} (${closeReason.replaceAll("_", " ").toLowerCase()}).`
            : `Set to ${status.replaceAll("_", " ").toLowerCase()}.`
          : undefined,
      };
    }
    case "LINKED_TO_CUSTOMER":
      return { label: "Linked to customer", detail: "Matched to an existing customer record." };
    case "CONVERTED_TO_CUSTOMER":
      return { label: "Customer created or linked", detail: "Ready for commercial follow-up." };
    case "QUOTE_CREATED":
      return { label: "Quote started", detail: "A quote draft was created from this lead." };
    case "LEAD_VISIT_CONFIRMED":
      return { label: "Sales visit scheduled" };
    case "LEAD_VISIT_RESCHEDULED":
      return { label: "Sales visit rescheduled" };
    case "LEAD_VISIT_CANCELED":
      return { label: "Sales visit canceled" };
    case "LEAD_VISIT_COMPLETED":
      return { label: "Sales visit completed" };
    case "SITE_VISIT_REQUESTED":
      return { label: "Site visit requested" };
    case "LEAD_VISIT_NO_SHOW":
      return { label: "Sales visit no-show" };
    default:
      return { label: type.replaceAll("_", " ").toLowerCase() };
  }
}

function buildRequestFields(input: BuildLeadReviewViewModelInput): LeadReviewRequestField[] {
  const fields: LeadReviewRequestField[] = [];
  const { requestJson, signalsJson, channel } = input;

  const type =
    input.requestType?.trim() ||
    requestJson.type?.trim() ||
    null;
  if (type) {
    fields.push({ label: "Request type", value: type });
  }

  const scope =
    input.scopeSummary?.trim() ||
    requestJson.scope?.trim() ||
    null;
  if (scope) {
    fields.push({ label: "What they need", value: scope });
  }

  const timing = formatNeededByTiming(requestJson.neededByBucket, requestJson.neededByDate);
  if (timing) {
    fields.push({ label: "Timing", value: timing });
  }

  const urgency = formatLeadUrgencyHint(signalsJson.urgencyHint);
  if (urgency) {
    fields.push({ label: "Urgency", value: urgency });
  }

  fields.push({ label: "Source", value: formatLeadChannel(channel) });
  if (signalsJson.sourceDetail?.trim()) {
    fields.push({ label: "Source detail", value: signalsJson.sourceDetail.trim() });
  }

  return fields;
}

function mergeLegacyParsedFields(
  fields: LeadReviewRequestField[],
  notes: string | null,
): LeadReviewRequestField[] {
  const parsed = parseIntakeNotes(notes);
  if (!parsed.isPublicIntake || parsed.parsedFields.length === 0) {
    return fields;
  }

  const existingLabels = new Set(fields.map((f) => f.label.toLowerCase()));
  const merged = [...fields];

  for (const pf of parsed.parsedFields) {
    const key = pf.label.toLowerCase();
    if (key.includes("request type") && existingLabels.has("request type")) continue;
    if (key.includes("what you need") && existingLabels.has("what they need")) continue;
    if (key.includes("timing") && existingLabels.has("timing")) continue;
    if (key.includes("service") && key.includes("location")) continue;
    if (existingLabels.has(key)) continue;
    merged.push({ label: pf.label, value: pf.value });
    existingLabels.add(key);
  }

  return merged;
}

export function buildLeadReviewViewModel(input: BuildLeadReviewViewModelInput): LeadReviewViewModel {
  const editHref = `/leads/${input.leadId}/edit`;

  const readiness =
    input.readiness ??
    evaluateLeadReadiness({
      contactName: input.contactName,
      companyName: input.companyName,
      email: input.email,
      phone: input.phone,
      address: input.jobsiteAddressLine,
      isAddressVerified: input.isAddressVerified,
    });

  const requirements: LeadReviewRequirementRow[] = REQUIREMENT_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    satisfied: def.check(readiness),
    fixHref:
      def.key === "location" &&
      (input.jobsiteAddressLine?.trim() ?? "").length > 0 &&
      !readiness.hasAddress
        ? "#address-verify"
        : editHref,
  }));

  let requestFields = buildRequestFields(input);
  requestFields = mergeLegacyParsedFields(requestFields, input.notes);

  const parsed = parseIntakeNotes(input.notes);
  const scopeText =
    input.scopeSummary?.trim() ||
    input.requestJson.scope?.trim() ||
    null;

  return {
    requestFields,
    scopeText,
    showLegacyNotes: Boolean(parsed.isPublicIntake && parsed.cleanNotes?.trim()),
    legacyNotesPreview: parsed.cleanNotes?.trim() || null,
    requirements,
    allRequirementsMet: readiness.isReady,
    attachments: input.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      contentType: a.contentType,
      downloadHref: `/api/media/attachments/${a.id}`,
    })),
    activity: input.events.map((e) => {
      const summary = summarizeLeadEvent(e.type, e.payload);
      return {
        id: e.id,
        label: summary.label,
        detail: summary.detail,
        createdAt: e.createdAt,
      };
    }),
    visits: input.visitRequests.map((v) => ({
      id: v.id,
      status: v.status,
      summary: formatVisitSummary(v),
      notes: v.notes,
    })),
  };
}

/** Convenience for loader: project request/signals from raw JSON. */
export function leadReviewFactsFromLeadJson(args: {
  request: unknown;
  signals: unknown;
}): { requestJson: LeadRequestJson; signalsJson: LeadSignalsJson } {
  return {
    requestJson: readRequest(args.request as Parameters<typeof readRequest>[0]),
    signalsJson: readSignals(args.signals as Parameters<typeof readSignals>[0]),
  };
}
