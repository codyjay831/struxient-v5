import type { SalesIntakeSource, SalesIntakeStatus, NeededByBucket, SalesVisitRequestStatus } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

/** Serializable sales intake visit request (Phase C site visits). */
export type SalesVisitRequestPayload = {
  id: string;
  requestedDate: Date | null;
  requestedWindow: string | null;
  confirmedDate: Date | null;
  status: SalesVisitRequestStatus;
  notes: string | null;
  createdAt: Date;
};

/** Serializable sales intake row for the detail shell (server-fetched, org-scoped). */
export type SalesIntakeDetailPayload = {
  id: string;
  title: string;
  status: SalesIntakeStatus;
  source: SalesIntakeSource;
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
  visitRequests: SalesVisitRequestPayload[];
};

const STATUS_LABELS: Record<SalesIntakeStatus, string> = {
  OPEN: "Open",
  QUALIFYING: "Qualifying",
  CONVERTED: "Converted",
  LOST: "Lost",
  ARCHIVED: "Archived",
};

const SOURCE_LABELS: Record<SalesIntakeSource, string> = {
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
export const SALES_INTAKE_SOURCE_FORM_OPTIONS: { value: SalesIntakeSource; label: string }[] = (
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
  ] as const satisfies readonly SalesIntakeSource[]
).map((value) => ({ value, label: SOURCE_LABELS[value] }));

/** Stable order for status transitions on intake detail (manual lifecycle). */
export const SALES_INTAKE_STATUS_FORM_OPTIONS: { value: SalesIntakeStatus; label: string }[] = (
  ["OPEN", "QUALIFYING", "CONVERTED", "LOST", "ARCHIVED"] as const satisfies readonly SalesIntakeStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }));

/** Counted as “open pipeline” for lightweight org metrics (excludes CONVERTED, LOST, ARCHIVED). */
export const SALES_INTAKE_PIPELINE_OPEN_STATUSES = ["OPEN", "QUALIFYING"] as const satisfies readonly SalesIntakeStatus[];

export function formatSalesIntakeStatus(status: SalesIntakeStatus): string {
  return STATUS_LABELS[status];
}

export function formatSalesIntakeSource(source: SalesIntakeSource): string {
  return SOURCE_LABELS[source];
}

export function salesIntakeStatusBadgeTone(status: SalesIntakeStatus): StatusBadgeTone {
  switch (status) {
    case "CONVERTED":
      return "approved";
    case "QUALIFYING":
      return "draft";
    default:
      return "neutral";
  }
}
