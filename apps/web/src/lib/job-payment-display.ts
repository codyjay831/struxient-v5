import { JobPaymentRequirementStatus } from "@prisma/client";
import { StatusBadgeTone } from "@/components/ui/status-badge";

export const JOB_PAYMENT_STATUS_LABELS: Record<JobPaymentRequirementStatus, string> = {
  PENDING: "Pending",
  DUE: "Due",
  PAID: "Paid",
  WAIVED: "Waived",
  CANCELED: "Canceled",
};

export function formatJobPaymentStatus(status: JobPaymentRequirementStatus): string {
  return JOB_PAYMENT_STATUS_LABELS[status];
}

export function jobPaymentStatusBadgeTone(status: JobPaymentRequirementStatus): StatusBadgeTone {
  switch (status) {
    case "PAID":
      return "approved";
    case "DUE":
      return "warning";
    case "PENDING":
      return "neutral";
    case "WAIVED":
      return "neutral";
    case "CANCELED":
      return "draft";
    default:
      return "neutral";
  }
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
