import type {
  LeadChannel,
  LeadCloseReason,
  LeadStatus,
  LeadVisitNextAction,
  LeadVisitOutcome,
  NeededByBucket,
  LeadVisitRequestStatus,
} from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import type {
  LeadVisitAccessSnapshot,
  LeadVisitSiteContactSnapshot,
} from "@/lib/scheduling/lead-visit-schemas";

/** Serializable lead visit request (Phase C site visits). */
export type LeadVisitRequestPayload = {
  id: string;
  requestedDate: Date | null;
  requestedWindow: string | null;
  confirmedDate: Date | null;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
  estimatedDurationMinutes: number | null;
  arrivalWindowStartAt: Date | null;
  arrivalWindowEndAt: Date | null;
  arrivalWindowLabel: string | null;
  assignedUserId: string | null;
  assignedUserLabel: string | null;
  accessSnapshot: LeadVisitAccessSnapshot | null;
  siteContactSnapshot: LeadVisitSiteContactSnapshot | null;
  hasAccessDetails: boolean;
  outcome: LeadVisitOutcome | null;
  nextAction: LeadVisitNextAction | null;
  completedAt?: Date | null;
  status: LeadVisitRequestStatus;
  purpose?: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  canEditAccessDetails?: boolean;
};

/** Serializable lead row for the detail shell (server-fetched, org-scoped). */
export type LeadDetailPayload = {
  id: string;
  title: string;
  status: LeadStatus;
  source: LeadChannel;
  sourceDetail: string | null;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  requestType: string | null;
  neededByBucket: NeededByBucket | null;
  neededByDate: Date | null;
  scopeSummary: string | null;
  /** Where work happens: structured intake and legacy public-request notes when needed. */
  jobsiteAddressLine: string | null;
  /** True when a linked customer already reflects this intake's service location. */
  intakeServiceLocationLinkedToCustomer: boolean;
  customerId: string | null;
  convertedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; displayName: string } | null;
  /** Site visit requests (Phase C). */
  visitRequests: LeadVisitRequestPayload[];
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  TRIAGING: "Triaging",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  ON_HOLD: "On hold",
  LOST: "Lost",
  ARCHIVED: "Archived",
};

const CLOSE_REASON_LABELS: Record<LeadCloseReason, string> = {
  CHOSE_ANOTHER: "Chose another contractor",
  BUDGET_OR_TIMING: "Budget or timing",
  NO_RESPONSE: "No response",
  NOT_OUR_TRADE: "Not our trade",
  OTHER: "Other",
};

const SOURCE_LABELS: Record<LeadChannel, string> = {
  WEB_FORM: "Web form",
  MANUAL: "Manual",
  EMAIL: "Email",
  SMS: "SMS",
  PHONE: "Phone",
  WEBHOOK: "Webhook",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  OTHER: "Other",
};

/** Stable order for the create-form source select (MANUAL first as default intake). */
export const LEAD_SOURCE_FORM_OPTIONS: { value: LeadChannel; label: string }[] = (
  [
    "MANUAL",
    "PHONE",
    "EMAIL",
    "SMS",
    "WEB_FORM",
    "WEBHOOK",
    "REFERRAL",
    "WALK_IN",
    "OTHER",
  ] as const satisfies readonly LeadChannel[]
).map((value) => ({ value, label: SOURCE_LABELS[value] }));

/** Stable order for status transitions on intake detail (manual lifecycle). */
export const LEAD_STATUS_FORM_OPTIONS: { value: LeadStatus; label: string }[] = (
  ["NEW", "TRIAGING", "QUALIFIED", "CONVERTED", "ON_HOLD", "LOST", "ARCHIVED"] as const satisfies readonly LeadStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Counted as “open pipeline” for lightweight org metrics (excludes CONVERTED, LOST, ARCHIVED). */
export const LEAD_PIPELINE_OPEN_STATUSES = ["NEW", "TRIAGING", "ON_HOLD"] as const satisfies readonly LeadStatus[];

export const LEAD_CLOSE_REASON_OPTIONS: { value: LeadCloseReason; label: string }[] = (
  ["CHOSE_ANOTHER", "BUDGET_OR_TIMING", "NO_RESPONSE", "NOT_OUR_TRADE", "OTHER"] as const satisfies readonly LeadCloseReason[]
).map((value) => ({ value, label: CLOSE_REASON_LABELS[value] }));

export function formatLeadStatus(status: LeadStatus): string {
  return STATUS_LABELS[status];
}

export function formatLeadChannel(source: LeadChannel): string {
  return SOURCE_LABELS[source];
}

const NEEDED_BY_BUCKET_LABELS: Record<NeededByBucket, string> = {
  ASAP: "ASAP",
  THIS_WEEK: "This week",
  THIS_MONTH: "This month",
  FLEXIBLE: "Flexible",
  SPECIFIC_DATE: "Specific date",
};

export function formatNeededByBucket(bucket: NeededByBucket | null | undefined): string | null {
  if (!bucket) return null;
  return NEEDED_BY_BUCKET_LABELS[bucket] ?? bucket.replaceAll("_", " ").toLowerCase();
}

export function formatNeededByTiming(
  bucket: NeededByBucket | null | undefined,
  neededByDate: Date | string | null | undefined,
): string | null {
  const bucketLabel = formatNeededByBucket(bucket);
  if (bucket === "SPECIFIC_DATE" && neededByDate) {
    const d = neededByDate instanceof Date ? neededByDate : new Date(neededByDate);
    if (!Number.isNaN(d.getTime())) {
      return `Specific date: ${d.toLocaleDateString()}`;
    }
  }
  return bucketLabel;
}

export function formatLeadUrgencyHint(
  hint: "LOW" | "MEDIUM" | "HIGH" | undefined | null,
): string | null {
  if (!hint) return null;
  switch (hint) {
    case "HIGH":
      return "High — respond soon";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    default:
      return null;
  }
}

export function formatAttachmentFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function leadStatusBadgeTone(status: LeadStatus): StatusBadgeTone {
  switch (status) {
    case "CONVERTED":
      return "approved";
    case "ON_HOLD":
      return "warning";
    case "TRIAGING":
    case "QUALIFIED":
      return "draft";
    default:
      return "neutral";
  }
}

export function formatLeadCloseReason(reason: LeadCloseReason | null | undefined): string | null {
  if (!reason) return null;
  return CLOSE_REASON_LABELS[reason] ?? reason.replaceAll("_", " ").toLowerCase();
}

/**
 * Parses raw intake notes from the public form into structured fields.
 */
export function parseIntakeNotes(notes: string | null) {
  if (!notes || !notes.includes("[Public Intake Form]")) {
    return {
      isPublicIntake: false,
      parsedFields: [] as { label: string; value: string }[],
      cleanNotes: notes,
    };
  }

  const fields: { label: string; value: string }[] = [];
  let cleanNotes = notes;

  // Remove the [System] part if it exists (usually contains matches which are handled elsewhere)
  const systemIndex = cleanNotes.indexOf("[System]");
  if (systemIndex !== -1) {
    cleanNotes = cleanNotes.substring(0, systemIndex).trim();
  }

  // Define the markers we want to extract
  const markers = [
    { label: "Service Location Address", marker: "Service / project location:" },
    { label: "Preferred timing", marker: "Preferred timing:" },
    { label: "Request Type", marker: "Request type:" },
    { label: "What you need help with", marker: "What you need help with:" },
  ];

  // Extract fields based on markers
  for (let i = 0; i < markers.length; i++) {
    const current = markers[i];
    
    const startIndex = cleanNotes.indexOf(current.marker);
    if (startIndex !== -1) {
      const valueStart = startIndex + current.marker.length;
      
      // Find the start of the next marker to know where this value ends
      let valueEnd = cleanNotes.length;
      for (let j = i + 1; j < markers.length; j++) {
        const nextMarkerIndex = cleanNotes.indexOf(markers[j].marker);
        if (nextMarkerIndex !== -1 && nextMarkerIndex > startIndex) {
          valueEnd = nextMarkerIndex;
          break;
        }
      }
      
      const value = cleanNotes.substring(valueStart, valueEnd).trim();
      if (value) {
        fields.push({ label: current.label, value });
      }
    }
  }

  // The "clean" notes for display should be the original notes minus the [System] part
  // and maybe the [Public Intake Form] tag if we want it really clean.
  const displayNotes = cleanNotes.replace("[Public Intake Form]", "").trim();

  return {
    isPublicIntake: true,
    parsedFields: fields,
    cleanNotes: displayNotes,
  };
}
