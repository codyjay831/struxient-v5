import { db, type ExtendedTransactionClient } from "../db";
import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteStatus,
} from "@prisma/client";
import { randomBytes } from "crypto";
import { addDays } from "date-fns";
import {
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForCustomerProposalCheckpoint,
  serializeCustomerPreviewDocumentForCheckpoint,
  type QuoteCheckpointSnapshotWire,
  type QuoteCheckpointStaffOnlyWire,
} from "../quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "../quote-customer-projection";
import { readContact } from "../lead/lead-projection";
import { notifyQuoteSent } from "../notifications";
import { getRequestContextOrThrow } from "../auth-context";

export interface QuoteSendOptions {
  expiresInDays?: number | null;
}

export interface QuoteSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Captures a SEND checkpoint for a quote.
 */
export async function captureQuoteSendCheckpoint(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
  organizationName: string,
): Promise<{ snapshotWire: QuoteCheckpointSnapshotWire; staffOnly: QuoteCheckpointStaffOnlyWire; quoteUpdatedAt: Date }> {
  const quote = await tx.quote.findFirst({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.DRAFT,
    },
    select: quoteSelectForCustomerProposalCheckpoint,
  });

  if (!quote) {
    throw new Error("QUOTE_SEND_CHECKPOINT_RACE");
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
      kind: QuoteCheckpointKind.SEND,
    },
    _max: { sequence: true },
  });
  const nextSequence = (aggregate._max.sequence ?? 0) + 1;

  await tx.quoteCheckpoint.create({
    data: {
      organizationId,
      quoteId,
      kind: QuoteCheckpointKind.SEND,
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
 * Transitions a quote to SENT status and ensures a share token exists.
 */
export async function transitionQuoteToSent(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
  options: QuoteSendOptions = {},
): Promise<{ shareToken: string; shareExpiresAt: Date | null }> {
  const now = new Date();
  const expiresAt = options.expiresInDays ? addDays(now, options.expiresInDays) : null;

  // Ensure share token exists
  const existingToken = await tx.quoteShareToken.findUnique({
    where: { quoteId },
  });

  let shareToken: string;
  if (!existingToken) {
    shareToken = randomBytes(32).toString("hex");
    await tx.quoteShareToken.create({
      data: {
        organizationId,
        quoteId,
        token: shareToken,
        expiresAt,
      },
    });
  } else {
    shareToken = existingToken.token;
    await tx.quoteShareToken.update({
      where: { quoteId },
      data: { expiresAt },
    });
  }

  const statusUpdate = await tx.quote.updateMany({
    where: {
      id: quoteId,
      organizationId,
      status: QuoteStatus.DRAFT,
    },
    data: {
      status: QuoteStatus.SENT,
      lastSentEmailAt: now,
    },
  });

  if (statusUpdate.count !== 1) {
    throw new Error("QUOTE_SEND_STATUS_RACE");
  }

  return { shareToken, shareExpiresAt: expiresAt };
}

/**
 * Enqueues a notification for a sent quote.
 */
export async function enqueueQuoteSentNotification(
  quoteId: string,
  shareToken: string,
  shareExpiresAt: Date | null,
  organizationId: string,
  organizationName: string,
): Promise<void> {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: {
      customer: { select: { displayName: true, email: true } },
      lead: { select: { contact: true } },
    },
  });

  const contact = readContact(quote?.lead?.contact);
  const customerEmail = quote?.customer?.email || contact?.email;
  const customerName = quote?.customer?.displayName || contact?.name || "Customer";

  if (customerEmail) {
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/q/${shareToken}`;
    // In a real app, this would be a real queue. For now, we just call it.
    // In Phase 2 we introduced local-queue, but notifications.ts handles its own async-ness usually.
    void notifyQuoteSent({
      organizationId,
      quoteId,
      customerEmail,
      customerName,
      organizationDisplayName: organizationName,
      shareUrl,
      expiresAt: shareExpiresAt,
    });
  }
}

/**
 * Main use case for sending a quote.
 */
export async function sendQuote(
  quoteId: string,
  options: QuoteSendOptions = {},
): Promise<QuoteSendResult> {
  const ctx = await getRequestContextOrThrow();
  const id = quoteId.trim();

  try {
    const { shareToken, shareExpiresAt } = await db.$transaction(async (tx) => {
      await captureQuoteSendCheckpoint(tx, id, ctx.organizationId, ctx.organizationName);
      return await transitionQuoteToSent(tx, id, ctx.organizationId, options);
    });

    await enqueueQuoteSentNotification(id, shareToken, shareExpiresAt, ctx.organizationId, ctx.organizationName);

    return { ok: true };
  } catch (e) {
    console.error("Failed to send quote", e);
    if (e instanceof Error) {
      if (e.message === "QUOTE_SEND_CHECKPOINT_RACE") {
        return { ok: false, error: "This quote changed state while sending. Refresh and try again." };
      }
      if (e.message === "QUOTE_SEND_STATUS_RACE") {
        return { ok: false, error: "This quote could not be marked sent. Refresh and try again." };
      }
    }
    return { ok: false, error: "An unexpected error occurred while sending the quote." };
  }
}
