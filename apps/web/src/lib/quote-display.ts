import type {
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
} from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

/** Serializable quote row for list views (server-fetched, org-scoped). */
export type QuoteListRowPayload = {
  id: string;
  title: string;
  status: QuoteStatus;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
  customer: { id: string; displayName: string } | null;
  salesIntake: { id: string; title: string } | null;
};

/** Minimal quote row for sales intake/customer detail sidebars (org-scoped). */
export type QuoteLinkedSummary = {
  id: string;
  title: string;
  status: QuoteStatus;
  totalCents: number;
  updatedAt: Date;
};

export type QuoteLineItemPayload = {
  id: string;
  sortOrder: number;
  description: string;
  customerScopeTitle: string | null;
  customerScopeDescription: string | null;
  customerIncludedNotes: string | null;
  customerExcludedNotes: string | null;
  customerPresentationGroup: string | null;
  quantityDisplay: string;
  unitAmountCents: number;
  lineTotalCents: number;
  internalNotes: string | null;
  /** Optional internal draft execution — not customer-facing. */
  executionSummary: {
    taskCount: number;
    summaryLine: string | null;
  };
  /** Internal execution planning — not customer-facing. */
  executionReviewStatus: QuoteLineExecutionReviewStatus;
  executionMergeMode: QuoteLineExecutionMergeMode;
  executionOrder: number;
  /** 1-based position after sorting by execution order on the quote. */
  workOrderPosition: number;
  workOrderTotal: number;
};

/** Minimal SEND checkpoint row for quote detail (staff-only list; not a version manager). */
export type QuoteSendCheckpointSummary = {
  id: string;
  sequence: number;
  createdAt: Date;
  quoteUpdatedAtAtCapture: Date | null;
};

/** Serializable quote for detail shell (server-fetched, org-scoped). */
export type QuoteDetailPayload = {
  id: string;
  title: string;
  customerDocumentTitle: string | null;
  status: QuoteStatus;
  internalNotes: string | null;
  subtotalCents: number;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
  customerId: string | null;
  salesIntakeId: string | null;
  customer: { id: string; displayName: string } | null;
  salesIntake: {
    id: string;
    title: string;
    notes: string | null;
    source: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  lineItems: QuoteLineItemPayload[];
};

const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  APPROVED: "Approved",
  ARCHIVED: "Archived",
};

/** Default value for dollar inputs seeded from stored integer cents (client-safe). */
export function formatCentsAsDollarInput(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  return (safe / 100).toFixed(2);
}

/** Formats integer cents as USD for read-only UI (dev / en-US baseline). */
export function formatMoneyCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safe / 100);
}

export function formatQuoteStatus(status: QuoteStatus): string {
  return STATUS_LABELS[status];
}

export function quoteStatusBadgeTone(status: QuoteStatus): StatusBadgeTone {
  switch (status) {
    case "ARCHIVED":
      return "neutral";
    case "APPROVED":
      return "approved";
    case "SENT":
      return "sent";
    default:
      return "draft";
  }
}
