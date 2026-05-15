import type { LeadChannel, LeadStatus, NeededByBucket, LeadVisitRequestStatus } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

/** Serializable lead visit request (Phase C site visits). */
export type LeadVisitRequestPayload = {
  id: string;
  requestedDate: Date | null;
  requestedWindow: string | null;
  confirmedDate: Date | null;
  status: LeadVisitRequestStatus;
  notes: string | null;
  createdAt: Date;
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
  LOST: "Lost",
  ARCHIVED: "Archived",
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
  ["NEW", "TRIAGING", "QUALIFIED", "CONVERTED", "LOST", "ARCHIVED"] as const satisfies readonly LeadStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Counted as “open pipeline” for lightweight org metrics (excludes CONVERTED, LOST, ARCHIVED). */
export const LEAD_PIPELINE_OPEN_STATUSES = ["NEW", "TRIAGING"] as const satisfies readonly LeadStatus[];

export function formatLeadStatus(status: LeadStatus): string {
  return STATUS_LABELS[status];
}

export function formatLeadChannel(source: LeadChannel): string {
  return SOURCE_LABELS[source];
}

export function leadStatusBadgeTone(status: LeadStatus): StatusBadgeTone {
  switch (status) {
    case "CONVERTED":
      return "approved";
    case "TRIAGING":
    case "QUALIFIED":
      return "draft";
    default:
      return "neutral";
  }
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
