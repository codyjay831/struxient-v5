import type { LeadSource, LeadStatus, NeededByBucket, LeadVisitRequestStatus } from "@prisma/client";
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
  source: LeadSource;
  sourceDetail: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  requestType: string | null;
  neededByBucket: NeededByBucket | null;
  neededByDate: Date | null;
  scopeSummary: string | null;
  /** Where work happens: structured lead intake and legacy public-request notes when needed. */
  jobsiteAddressLine: string | null;
  /** True when a linked customer already reflects this lead's intake service location. */
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
  OPEN: "Open",
  QUALIFYING: "Qualifying",
  CONVERTED: "Converted",
  LOST: "Lost",
  ARCHIVED: "Archived",
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  PHONE: "Phone",
  EMAIL: "Email",
  SMS: "SMS",
  WEBSITE: "Website",
  PUBLIC_REQUEST_LINK: "Public request link",
  REFERRAL: "Referral",
  WALK_IN: "Walk-in",
  MANUAL: "Manual",
  OTHER: "Other",
};

/** Stable order for the create-form source select (MANUAL first as default intake). */
export const LEAD_SOURCE_FORM_OPTIONS: { value: LeadSource; label: string }[] = (
  [
    "MANUAL",
    "PHONE",
    "EMAIL",
    "SMS",
    "WEBSITE",
    "PUBLIC_REQUEST_LINK",
    "REFERRAL",
    "WALK_IN",
    "OTHER",
  ] as const satisfies readonly LeadSource[]
).map((value) => ({ value, label: SOURCE_LABELS[value] }));

/** Stable order for status transitions on lead detail (manual lifecycle). */
export const LEAD_STATUS_FORM_OPTIONS: { value: LeadStatus; label: string }[] = (
  ["OPEN", "QUALIFYING", "CONVERTED", "LOST", "ARCHIVED"] as const satisfies readonly LeadStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Counted as “open pipeline” for lightweight org metrics (excludes CONVERTED, LOST, ARCHIVED). */
export const LEAD_PIPELINE_OPEN_STATUSES = ["OPEN", "QUALIFYING"] as const satisfies readonly LeadStatus[];

export function formatLeadStatus(status: LeadStatus): string {
  return STATUS_LABELS[status];
}

export function formatLeadSource(source: LeadSource): string {
  return SOURCE_LABELS[source];
}

export function leadStatusBadgeTone(status: LeadStatus): StatusBadgeTone {
  switch (status) {
    case "CONVERTED":
      return "approved";
    case "QUALIFYING":
      return "draft";
    default:
      return "neutral";
  }
}
