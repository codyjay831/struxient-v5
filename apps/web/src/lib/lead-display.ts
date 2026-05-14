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
