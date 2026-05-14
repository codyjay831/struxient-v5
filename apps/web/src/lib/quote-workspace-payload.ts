/**
 * Serializable workspace-tab payload consumed by `QuoteWorkSurface`.
 */

import type { QuoteLineItemPayload, PaymentScheduleItemPayload } from "@/lib/quote-display";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";

/** Send / Approval checkpoint summary (serialized — no `Date`). */
export type QuoteWorkspaceCheckpointPayload = {
  id: string;
  sequence: number;
  /** Canonical full-page URL: `/quotes/[quoteId]/checkpoints/[checkpointId]`. */
  href: string;
  createdAtIso: string;
  /** `new Date(createdAt).toLocaleString()` — matches today's panel formatting. */
  createdAtLabel: string;
  quoteUpdatedAtAtCaptureIso: string | null;
  quoteUpdatedAtAtCaptureLabel: string | null;
  /** Source of the checkpoint (Phase F). */
  source?: "STAFF" | "CUSTOMER_PORTAL";
};

/** Lead context shown inside the Customer & Lead tab. */
export type QuoteWorkspaceLead = {
  id: string;
  title: string;
  href: string;
  notes: string | null;
  source: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
};

/**
 * Everything `QuoteWorkSurface` needs to render its workspace tabs.
 */
export type QuoteWorkspaceTabData = {
  /* Permission flags derived from quote status */
  isCommercialEditable: boolean;
  isExecutionEditable: boolean;
  isArchived: boolean;

  /* Scope tab */
  customerDocumentTitle: string | null;
  internalNotes: string | null;
  hasLeadNotes: boolean;
  subtotalCents: number;
  totalCents: number;
  lineItems: QuoteLineItemPayload[];
  lineItemTemplates: LineItemTemplatePickerRow[];
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  reusableTaskOptions: ReusableTaskPickerOption[];
  stages: { id: string, name: string }[];

  /* Payments tab */
  paymentSchedule: PaymentScheduleItemPayload[];

  /* Customer & Lead tab */
  customerName: string | null;
  customerHref: string | null;
  lead: QuoteWorkspaceLead | null;

  /* Send & Accept tab */
  sendCheckpoints: QuoteWorkspaceCheckpointPayload[];
  approvalCheckpoints: QuoteWorkspaceCheckpointPayload[];

  /* Record tab + Overview record-details disclosure */
  createdAtIso: string;
  createdAtLabel: string;
  updatedAtIso: string;
  updatedAtLabel: string;
};
