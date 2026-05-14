import { db, type ExtendedTransactionClient } from "../db";
import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteStatus,
} from "@prisma/client";
import {
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForCustomerProposalCheckpoint,
  serializeCustomerPreviewDocumentForCheckpoint,
  type QuoteCheckpointSnapshotWire,
  type QuoteCheckpointStaffOnlyWire,
} from "../quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "../quote-customer-projection";
import { getRequestContextOrThrow } from "../auth-context";

export interface QuoteApproveResult {
  ok: boolean;
  error?: string;
}

/**
 * Captures an APPROVAL checkpoint for a quote.
 */
export async function captureQuoteApprovalCheckpoint(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
  organizationName: string,
): Promise<{ snapshotWire: QuoteCheckpointSnapshotWire; staffOnly: QuoteCheckpointStaffOnlyWire; quoteUpdatedAt: Date }> {
  const quote = await tx.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.SENT,
    },
    select: quoteSelectForCustomerProposalCheckpoint,
  });

  if (!quote) {
    throw new Error("QUOTE_APPROVAL_RACE");
  }

  const input = quoteRowToCustomerPreviewInput(quote, organizationId);
  const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
    organizationDisplayName: organizationName,
  });

  const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

  const aggregate = await tx.quoteCheckpoint.aggregate({
    where: {
      organizationId,
      quoteId,
      kind: QuoteCheckpointKind.APPROVAL,
    },
    _max: { sequence: true },
  });
  const nextSequence = (aggregate._max.sequence ?? 0) + 1;

  await tx.quoteCheckpoint.create({
    data: {
      organizationId,
      quoteId,
      kind: QuoteCheckpointKind.APPROVAL,
      source: QuoteCheckpointSource.STAFF,
      sequence: nextSequence,
      schemaVersion: QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
      snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
      staffOnlyJson: {
        anyLineUsesInternalDescriptionForTitle: staffOnly.anyLineUsesInternalDescriptionForTitle,
      } as Prisma.InputJsonValue,
      quoteUpdatedAtAtCapture: quote.updatedAt,
    },
  });

  return { snapshotWire, staffOnly, quoteUpdatedAt: quote.updatedAt };
}

/**
 * Transitions a quote to APPROVED status.
 */
export async function transitionQuoteToApproved(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
): Promise<void> {
  const statusUpdate = await tx.quote.updateMany({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.SENT,
    },
    data: {
      status: QuoteStatus.APPROVED,
    },
  });

  if (statusUpdate.count !== 1) {
    throw new Error("QUOTE_APPROVAL_STATUS_RACE");
  }
}

/**
 * Main use case for approving a quote.
 */
export async function approveQuote(quoteId: string): Promise<QuoteApproveResult> {
  const ctx = await getRequestContextOrThrow();
  const id = quoteId.trim();

  try {
    await db.$transaction(async (tx) => {
      await captureQuoteApprovalCheckpoint(tx, id, ctx.organizationId, ctx.organizationName);
      await transitionQuoteToApproved(tx, id, ctx.organizationId);
    });

    return { ok: true };
  } catch (e) {
    console.error("Failed to approve quote", e);
    if (e instanceof Error) {
      if (e.message === "QUOTE_APPROVAL_RACE") {
        return { ok: false, error: "This quote changed state while approving. Refresh and try again." };
      }
      if (e.message === "QUOTE_APPROVAL_STATUS_RACE") {
        return { ok: false, error: "This quote could not be marked approved. Refresh and try again." };
      }
    }
    return { ok: false, error: "An unexpected error occurred while approving the quote." };
  }
}
