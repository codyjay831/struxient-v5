import type { Prisma } from "@prisma/client";
import type {
  QuoteCustomerPreviewDocument,
  QuoteCustomerPreviewInput,
  QuoteCustomerPreviewLine,
} from "@/lib/quote-customer-projection";
import { deriveLeadTitle } from "@/lib/lead/lead-projection";

/** Column + JSON shape version for SEND checkpoint payloads. Bump when breaking stored shape. */
export const QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION = 2;

/** Prisma `select` for quotes when building SEND checkpoint payloads — mirrors preview route (no internalNotes). */
export const quoteSelectForCustomerProposalCheckpoint = {
  id: true,
  organizationId: true,
  title: true,
  customerDocumentTitle: true,
  customerId: true,
  leadId: true,
  subtotalCents: true,
  totalCents: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      displayName: true,
      organizationId: true,
    },
  },
  lead: {
    select: {
      contact: true,
      request: true,
      organizationId: true,
    },
  },
  lineItems: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    select: {
      id: true,
      sortOrder: true,
      description: true,
      customerScopeTitle: true,
      customerScopeDescription: true,
      customerIncludedNotes: true,
      customerExcludedNotes: true,
      customerPresentationGroup: true,
      quantity: true,
      unitAmountCents: true,
      lineTotalCents: true,
    },
  },
};

/** Same safe projection select as checkpoints, plus `status` for the live preview route. */
export const quoteSelectForLiveCustomerPreviewPage = {
  ...quoteSelectForCustomerProposalCheckpoint,
  status: true,
};

export type QuoteRowForCustomerProposalCheckpoint = Prisma.QuoteGetPayload<{
  select: typeof quoteSelectForCustomerProposalCheckpoint;
}>;

export type QuoteRowForLiveCustomerPreviewPage = Prisma.QuoteGetPayload<{
  select: typeof quoteSelectForLiveCustomerPreviewPage;
}>;

/** Maps a checkpoint- or preview-shaped quote row to preview input (org-scoped customer/lead). */
export function quoteRowToCustomerPreviewInput(
  row: QuoteRowForCustomerProposalCheckpoint | QuoteRowForLiveCustomerPreviewPage,
  orgId: string,
): QuoteCustomerPreviewInput {
  const customer =
    row.customer && row.customer.organizationId === orgId
      ? { displayName: row.customer.displayName }
      : null;
  const lead =
    row.lead && row.lead.organizationId === orgId
      ? { title: deriveLeadTitle(row.lead.contact, row.lead.request) }
      : null;
  return {
    id: row.id,
    title: row.title,
    customerDocumentTitle: row.customerDocumentTitle,
    customer,
    lead,
    lineItems: row.lineItems.map((line) => ({
      id: line.id,
      sortOrder: line.sortOrder,
      description: line.description,
      customerScopeTitle: line.customerScopeTitle,
      customerScopeDescription: line.customerScopeDescription,
      customerIncludedNotes: line.customerIncludedNotes,
      customerExcludedNotes: line.customerExcludedNotes,
      customerPresentationGroup: line.customerPresentationGroup,
      quantityDisplay: line.quantity.toString(),
      unitAmountCents: line.unitAmountCents,
      lineTotalCents: line.lineTotalCents,
    })),
    subtotalCents: row.subtotalCents,
    totalCents: row.totalCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

type WirePreviewLine = Omit<QuoteCustomerPreviewLine, never>;

type WirePreviewDocument = {
  organizationDisplayName: string;
  quoteId: string;
  documentTitle: string;
  customer: { displayName: string } | null;
  lead: { title: string } | null;
  lineItems: WirePreviewLine[];
  subtotalCents: number;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
};

export type QuoteCheckpointSnapshotWire = {
  document: WirePreviewDocument;
};

export type QuoteCheckpointStaffOnlyWire = {
  anyLineUsesInternalDescriptionForTitle: boolean;
};

export function serializeCustomerPreviewDocumentForCheckpoint(
  document: QuoteCustomerPreviewDocument,
): QuoteCheckpointSnapshotWire {
  return {
    document: {
      organizationDisplayName: document.organizationDisplayName,
      quoteId: document.quoteId,
      documentTitle: document.documentTitle,
      customer: document.customer,
      lead: document.lead,
      lineItems: document.lineItems.map((l) => ({ ...l })),
      subtotalCents: document.subtotalCents,
      totalCents: document.totalCents,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revivePreviewDocument(wire: WirePreviewDocument): QuoteCustomerPreviewDocument {
  return {
    organizationDisplayName: wire.organizationDisplayName,
    quoteId: wire.quoteId,
    documentTitle: wire.documentTitle,
    customer: wire.customer,
    lead: wire.lead,
    lineItems: wire.lineItems,
    subtotalCents: wire.subtotalCents,
    totalCents: wire.totalCents,
    createdAt: new Date(wire.createdAt),
    updatedAt: new Date(wire.updatedAt),
  };
}

/**
 * Parses stored `snapshotJson` for checkpoint viewer. Fails closed on unknown schema or bad shape.
 */
export function parseQuoteSendCheckpointSnapshot(
  schemaVersion: number,
  snapshotJson: unknown,
):
  | { ok: true; document: QuoteCustomerPreviewDocument }
  | { ok: false; error: string } {
  if (schemaVersion !== QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported checkpoint snapshot schema version (${schemaVersion}).`,
    };
  }
  if (!isRecord(snapshotJson)) {
    return { ok: false, error: "Checkpoint payload is not a valid object." };
  }
  const docRaw = snapshotJson.document;
  if (!isRecord(docRaw)) {
    return { ok: false, error: "Checkpoint payload is missing document." };
  }
  const d = docRaw as Record<string, unknown>;
  const orgName = d.organizationDisplayName;
  const quoteId = d.quoteId;
  const documentTitle = d.documentTitle;
  if (typeof orgName !== "string" || typeof quoteId !== "string" || typeof documentTitle !== "string") {
    return { ok: false, error: "Checkpoint document has invalid header fields." };
  }
  if (typeof d.subtotalCents !== "number" || typeof d.totalCents !== "number") {
    return { ok: false, error: "Checkpoint document has invalid totals." };
  }
  if (typeof d.createdAt !== "string" || typeof d.updatedAt !== "string") {
    return { ok: false, error: "Checkpoint document has invalid timestamps." };
  }
  if (!Array.isArray(d.lineItems)) {
    return { ok: false, error: "Checkpoint document has invalid line items." };
  }
  for (const line of d.lineItems) {
    if (!isRecord(line)) {
      return { ok: false, error: "Checkpoint line item is malformed." };
    }
    const l = line as Record<string, unknown>;
    if (
      typeof l.id !== "string" ||
      typeof l.sortOrder !== "number" ||
      typeof l.lineTitle !== "string" ||
      (l.presentationGroup !== null && typeof l.presentationGroup !== "string") ||
      (l.lineDetail !== null && typeof l.lineDetail !== "string") ||
      (l.includedNotes !== null && typeof l.includedNotes !== "string") ||
      (l.excludedNotes !== null && typeof l.excludedNotes !== "string") ||
      typeof l.quantityDisplay !== "string" ||
      typeof l.unitAmountCents !== "number" ||
      typeof l.lineTotalCents !== "number"
    ) {
      return { ok: false, error: "Checkpoint line item fields are invalid." };
    }
  }
  const customer = d.customer;
  if (customer != null && (!isRecord(customer) || typeof customer.displayName !== "string")) {
    return { ok: false, error: "Checkpoint customer context is invalid." };
  }
  const lead = d.lead;
  if (lead != null && (!isRecord(lead) || typeof lead.title !== "string")) {
    return { ok: false, error: "Checkpoint lead context is invalid." };
  }

  const wire: WirePreviewDocument = {
    organizationDisplayName: orgName,
    quoteId,
    documentTitle,
    customer:
      customer == null
        ? null
        : { displayName: (customer as { displayName: string }).displayName },
    lead: lead == null ? null : { title: (lead as { title: string }).title },
    lineItems: d.lineItems as WirePreviewLine[],
    subtotalCents: d.subtotalCents,
    totalCents: d.totalCents,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };

  const createdProbe = new Date(wire.createdAt);
  const updatedProbe = new Date(wire.updatedAt);
  if (Number.isNaN(createdProbe.getTime()) || Number.isNaN(updatedProbe.getTime())) {
    return { ok: false, error: "Checkpoint document has invalid timestamp values." };
  }

  return { ok: true, document: revivePreviewDocument(wire) };
}

export function parseQuoteCheckpointStaffOnly(
  staffOnlyJson: unknown,
): { anyLineUsesInternalDescriptionForTitle: boolean } {
  if (!isRecord(staffOnlyJson)) {
    return { anyLineUsesInternalDescriptionForTitle: false };
  }
  const v = staffOnlyJson.anyLineUsesInternalDescriptionForTitle;
  return { anyLineUsesInternalDescriptionForTitle: v === true };
}
