import { addDays } from "date-fns";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteSignatureEventType,
  QuoteSignatureMode,
  QuoteSignatureRecipientStatus,
  QuoteSignatureRequestStatus,
  QuoteStatus,
  SignatureActorType,
  SignatureProvider,
} from "@prisma/client";
import {
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForCustomerProposalCheckpoint,
} from "@/lib/quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "@/lib/quote-customer-projection";
import { readContact } from "@/lib/lead/lead-projection";
import {
  getCommercialMutationContextOrThrow as getCommercialRequestContextOrThrow,
} from "@/lib/auth-context";
import type { ActorContext } from "@/lib/authz/context";
import { assertQuoteReadyToSendInTx } from "@/lib/quote/quote-send-readiness";
import {
  buildFrozenSnapshotWire,
  computeFrozenSnapshotSha256,
} from "./frozen-snapshot";
import { generateAndStoreSentPdf } from "./artifact-service";
import { recordQuoteSignatureEvent } from "./event-service";
import { sendSignatureEmail } from "./delivery-service";
import { buildSignerUrl, createSignerTokenPair } from "./recipient-token-service";
import { ACTIVE_SIGNATURE_REQUEST_STATUSES } from "./status-service";

export type StandardAcceptanceSendOptions = {
  expiresInDays?: number | null;
  recipients?: { email: string; name?: string }[];
  customMessage?: string;
  resendExisting?: boolean;
};

export type StandardAcceptanceSendResult = {
  ok: boolean;
  error?: string;
  outcome?: "sent" | "delivery_failed" | "ready_to_send" | "not_ready";
  message?: string;
  signatureRequestId?: string;
  recipientTokens?: { recipientId: string; email: string; rawToken: string }[];
  deliveryWarnings?: string[];
};

async function resolveDefaultRecipients(
  quoteId: string,
  provided?: { email: string; name?: string }[],
): Promise<{ email: string; name?: string }[]> {
  if (provided && provided.length > 0) return provided;
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
  if (customerEmail) return [{ email: customerEmail, name: customerName }];
  return [];
}

async function findActiveRequestForQuote(
  tx: ExtendedTransactionClient,
  quoteId: string,
  organizationId: string,
) {
  return tx.quoteSignatureRequest.findFirst({
    where: {
      quoteId,
      organizationId,
      mode: QuoteSignatureMode.STANDARD_ACCEPTANCE,
      status: { in: ACTIVE_SIGNATURE_REQUEST_STATUSES },
    },
    include: { recipients: true },
    orderBy: { createdAt: "desc" },
  });
}

async function createSignatureRequestInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    organizationName: string;
    requestedByUserId?: string;
    options: StandardAcceptanceSendOptions;
  },
): Promise<{
  signatureRequestId: string;
  recipientTokens: { recipientId: string; email: string; rawToken: string }[];
  sendCheckpointId: string;
  expiresAt: Date | null;
  customMessage?: string;
  organizationName: string;
  quoteId: string;
  organizationId: string;
  customerId: string | null;
  leadId: string | null;
}> {
  const { quoteId, organizationId, organizationName, options } = params;

  const readiness = await assertQuoteReadyToSendInTx(tx, quoteId, organizationId);
  if (!readiness.ok) {
    throw new Error(`QUOTE_SEND_NOT_READY:${readiness.error}`);
  }

  const existingActive = await findActiveRequestForQuote(tx, quoteId, organizationId);
  if (existingActive) {
    throw new Error("QUOTE_SEND_ACTIVE_REQUEST_EXISTS");
  }

  const quote = await tx.quote.findFirst({
    where: { id: quoteId, organizationId, status: QuoteStatus.DRAFT },
    select: {
      ...quoteSelectForCustomerProposalCheckpoint,
      customerId: true,
      leadId: true,
    },
  });
  if (!quote) throw new Error("QUOTE_SEND_CHECKPOINT_RACE");

  const input = quoteRowToCustomerPreviewInput(quote, organizationId);
  const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
    organizationDisplayName: organizationName,
  });
  const snapshotWire = buildFrozenSnapshotWire(document);
  const frozenSnapshotSha256 = computeFrozenSnapshotSha256(snapshotWire);

  const now = new Date();
  const expiresAt = options.expiresInDays ? addDays(now, options.expiresInDays) : null;

  const request = await tx.quoteSignatureRequest.create({
    data: {
      organizationId,
      quoteId,
      mode: QuoteSignatureMode.STANDARD_ACCEPTANCE,
      provider: SignatureProvider.STRUXIENT,
      status: QuoteSignatureRequestStatus.DRAFT,
      requestedByUserId: params.requestedByUserId,
      customMessage: options.customMessage,
      expiresAt,
      frozenSnapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
      frozenSnapshotSha256,
    },
  });

  const aggregate = await tx.quoteCheckpoint.aggregate({
    where: { organizationId, quoteId, kind: QuoteCheckpointKind.SEND },
    _max: { sequence: true },
  });
  const nextSequence = (aggregate._max.sequence ?? 0) + 1;

  const sendCheckpoint = await tx.quoteCheckpoint.create({
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
        recipients: options.recipients,
        customMessage: options.customMessage,
        signatureRequestId: request.id,
      } as Prisma.InputJsonValue,
      quoteUpdatedAtAtCapture: quote.updatedAt,
    },
  });

  const sentPdf = await generateAndStoreSentPdf(tx, {
    organizationId,
    quoteId,
    signatureRequestId: request.id,
    document,
    customerId: quote.customerId,
    leadId: quote.leadId,
  });

  await tx.quoteSignatureRequest.update({
    where: { id: request.id },
    data: {
      sendCheckpointId: sendCheckpoint.id,
      sentPdfArtifactId: sentPdf.artifactId,
      sentPdfSha256: sentPdf.sha256,
      status: QuoteSignatureRequestStatus.READY_TO_SEND,
    },
  });

  await recordQuoteSignatureEvent(tx, {
    organizationId,
    quoteId,
    signatureRequestId: request.id,
    actorType: SignatureActorType.STAFF,
    actorUserId: params.requestedByUserId,
    eventType: QuoteSignatureEventType.SIGNATURE_REQUEST_CREATED,
  });

  const recipients = options.recipients?.length
    ? options.recipients
    : await resolveDefaultRecipients(quoteId, options.recipients);

  if (recipients.length === 0) {
    throw new Error("QUOTE_SEND_NO_RECIPIENTS");
  }

  const recipientTokens: { recipientId: string; email: string; rawToken: string }[] = [];
  for (const r of recipients) {
    const { rawToken, tokenHash } = createSignerTokenPair();
    const recipient = await tx.quoteSignatureRecipient.create({
      data: {
        organizationId,
        signatureRequestId: request.id,
        quoteId,
        recipientName: r.name,
        recipientEmail: r.email,
        tokenHash,
        tokenExpiresAt: expiresAt,
        status: QuoteSignatureRecipientStatus.PENDING,
      },
    });
    recipientTokens.push({ recipientId: recipient.id, email: r.email, rawToken });
  }

  const statusUpdate = await tx.quote.updateMany({
    where: { id: quoteId, organizationId, status: QuoteStatus.DRAFT },
    data: { status: QuoteStatus.SENT, lastSentEmailAt: now },
  });
  if (statusUpdate.count !== 1) throw new Error("QUOTE_SEND_STATUS_RACE");

  return {
    signatureRequestId: request.id,
    recipientTokens,
    sendCheckpointId: sendCheckpoint.id,
    expiresAt,
    customMessage: options.customMessage,
    organizationName,
    quoteId,
    organizationId,
    customerId: quote.customerId,
    leadId: quote.leadId,
  };
}

async function deliverToRecipients(
  params: {
    signatureRequestId: string;
    quoteId: string;
    organizationId: string;
    organizationName: string;
    customMessage?: string;
    expiresAt: Date | null;
    recipientTokens: { recipientId: string; email: string; rawToken: string }[];
    isResend?: boolean;
  },
): Promise<{ allOk: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  let allOk = true;

  for (const rt of params.recipientTokens) {
    const result = await sendSignatureEmail({
      organizationId: params.organizationId,
      quoteId: params.quoteId,
      signatureRequestId: params.signatureRequestId,
      recipientId: rt.recipientId,
      recipientEmail: rt.email,
      organizationDisplayName: params.organizationName,
      shareUrl: buildSignerUrl(rt.rawToken),
      customMessage: params.customMessage,
      expiresAt: params.expiresAt,
    });

    if (result.ok) {
      await db.quoteSignatureRecipient.update({
        where: { id: rt.recipientId },
        data: { status: QuoteSignatureRecipientStatus.SENT, sentAt: new Date() },
      });
    } else {
      allOk = false;
      warnings.push(`${rt.email}: ${result.errorMessage}`);
    }
  }

  const now = new Date();
  const requestStatus = allOk
    ? QuoteSignatureRequestStatus.SENT
    : QuoteSignatureRequestStatus.DELIVERY_FAILED;

  await db.quoteSignatureRequest.update({
    where: { id: params.signatureRequestId },
    data: {
      status: requestStatus,
      sentAt: allOk ? now : undefined,
    },
  });

  await recordQuoteSignatureEvent(db, {
    organizationId: params.organizationId,
    quoteId: params.quoteId,
    signatureRequestId: params.signatureRequestId,
    actorType: SignatureActorType.SYSTEM,
    eventType: allOk
      ? params.isResend
        ? QuoteSignatureEventType.SIGNATURE_REQUEST_RESENT
        : QuoteSignatureEventType.SIGNATURE_REQUEST_SENT
      : QuoteSignatureEventType.EMAIL_FAILED,
    metadataJson: warnings.length ? { warnings } : undefined,
  });

  return { allOk, warnings };
}

export async function sendStandardAcceptanceQuoteWithActorContext(
  quoteId: string,
  options: StandardAcceptanceSendOptions,
  ctx: Pick<ActorContext, "organizationId" | "organizationName" | "userId">,
): Promise<StandardAcceptanceSendResult> {
  const id = quoteId.trim();

  try {
    const txResult = await db.$transaction(async (tx) =>
      createSignatureRequestInTx(tx, {
        quoteId: id,
        organizationId: ctx.organizationId,
        organizationName: ctx.organizationName,
        requestedByUserId: ctx.userId,
        options,
      }),
    );

    const { allOk, warnings } = await deliverToRecipients({
      ...txResult,
      isResend: false,
    });

    if (allOk) {
      return {
        ok: true,
        outcome: "sent",
        message: "Quote sent and email queued.",
        signatureRequestId: txResult.signatureRequestId,
        recipientTokens: txResult.recipientTokens,
      };
    }

    return {
      ok: true,
      outcome: "delivery_failed",
      message: "Quote frozen and signer link created, but email was not sent.",
      signatureRequestId: txResult.signatureRequestId,
      recipientTokens: txResult.recipientTokens,
      deliveryWarnings: warnings,
    };
  } catch (e) {
    console.error("Failed to send standard acceptance quote", e);
    if (e instanceof Error) {
      if (e.message.startsWith("QUOTE_SEND_NOT_READY:")) {
        return {
          ok: false,
          outcome: "not_ready",
          error: e.message.slice("QUOTE_SEND_NOT_READY:".length),
        };
      }
      if (e.message === "QUOTE_SEND_CHECKPOINT_RACE") {
        return { ok: false, error: "This quote changed state while sending. Refresh and try again." };
      }
      if (e.message === "QUOTE_SEND_STATUS_RACE") {
        return { ok: false, error: "This quote could not be marked sent. Refresh and try again." };
      }
      if (e.message === "QUOTE_SEND_NO_RECIPIENTS") {
        return { ok: false, error: "At least one recipient email is required." };
      }
      if (e.message === "QUOTE_SEND_ACTIVE_REQUEST_EXISTS") {
        return { ok: false, error: "An active signature request already exists for this quote." };
      }
    }
    return { ok: false, error: "An unexpected error occurred while sending the quote." };
  }
}

export async function sendStandardAcceptanceQuote(
  quoteId: string,
  options: StandardAcceptanceSendOptions = {},
): Promise<StandardAcceptanceSendResult> {
  const ctx = await getCommercialRequestContextOrThrow();
  return sendStandardAcceptanceQuoteWithActorContext(quoteId, options, ctx);
}

export async function resendSignatureRequest(
  signatureRequestId: string,
): Promise<StandardAcceptanceSendResult> {
  const ctx = await getCommercialRequestContextOrThrow();

  const request = await db.quoteSignatureRequest.findFirst({
    where: { id: signatureRequestId, organizationId: ctx.organizationId },
    include: { recipients: true },
  });
  if (!request) return { ok: false, error: "Signature request not found." };
  if (request.status === QuoteSignatureRequestStatus.ACCEPTED) {
    return { ok: false, error: "Accepted requests cannot be resent." };
  }
  if (request.status === QuoteSignatureRequestStatus.REVOKED) {
    return { ok: false, error: "Revoked requests cannot be resent." };
  }

  const recipientTokens: { recipientId: string; email: string; rawToken: string }[] = [];
  for (const r of request.recipients) {
    if (r.tokenRevokedAt) continue;
    const { rawToken, tokenHash } = createSignerTokenPair();
    await db.quoteSignatureRecipient.update({
      where: { id: r.id },
      data: { tokenHash, tokenExpiresAt: request.expiresAt },
    });
    if (r.recipientEmail) {
      recipientTokens.push({ recipientId: r.id, email: r.recipientEmail, rawToken });
    }
  }

  if (recipientTokens.length === 0) {
    return { ok: false, error: "No active recipients to resend." };
  }

  const { allOk, warnings } = await deliverToRecipients({
    signatureRequestId: request.id,
    quoteId: request.quoteId,
    organizationId: request.organizationId,
    organizationName: ctx.organizationName,
    customMessage: request.customMessage ?? undefined,
    expiresAt: request.expiresAt,
    recipientTokens,
    isResend: true,
  });

  return {
    ok: true,
    outcome: allOk ? "sent" : "delivery_failed",
    message: allOk
      ? "Signature request resent."
      : "Resend attempted but email delivery failed.",
    signatureRequestId: request.id,
    deliveryWarnings: warnings.length ? warnings : undefined,
  };
}

export async function revokeSignatureRequestInTx(
  tx: ExtendedTransactionClient,
  params: {
    request: {
      id: string;
      organizationId: string;
      quoteId: string;
      status: QuoteSignatureRequestStatus;
      revokedAt: Date | null;
      recipients: { id: string }[];
    };
    actorUserId?: string | null;
    actorType?: SignatureActorType;
    reason?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: true; alreadyRevoked?: boolean } | { ok: false; error: string }> {
  const { request } = params;
  if (request.status === QuoteSignatureRequestStatus.ACCEPTED) {
    return { ok: false, error: "Accepted requests cannot be revoked." };
  }
  if (request.revokedAt) {
    return { ok: true, alreadyRevoked: true };
  }

  const now = new Date();
  await tx.quoteSignatureRequest.update({
    where: { id: request.id },
    data: {
      status: QuoteSignatureRequestStatus.REVOKED,
      revokedAt: now,
    },
  });
  for (const r of request.recipients) {
    await tx.quoteSignatureRecipient.update({
      where: { id: r.id },
      data: {
        status: QuoteSignatureRecipientStatus.REVOKED,
        tokenRevokedAt: now,
      },
    });
  }
  await recordQuoteSignatureEvent(tx, {
    organizationId: request.organizationId,
    quoteId: request.quoteId,
    signatureRequestId: request.id,
    actorType: params.actorType ?? SignatureActorType.STAFF,
    actorUserId: params.actorUserId ?? undefined,
    eventType: QuoteSignatureEventType.SIGNATURE_REQUEST_REVOKED,
    metadataJson: {
      ...(params.reason ? { reason: params.reason } : {}),
      ...(params.metadata ?? {}),
    },
  });

  return { ok: true };
}

/**
 * Revokes all active unaccepted signature requests on a quote (e.g. commercial revision).
 */
export async function revokeActiveSignatureRequestsForQuoteInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    actorUserId?: string | null;
    reason: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ revokedCount: number }> {
  const requests = await tx.quoteSignatureRequest.findMany({
    where: {
      quoteId: params.quoteId,
      organizationId: params.organizationId,
      status: { in: ACTIVE_SIGNATURE_REQUEST_STATUSES },
    },
    include: { recipients: { select: { id: true } } },
  });

  let revokedCount = 0;
  for (const request of requests) {
    const result = await revokeSignatureRequestInTx(tx, {
      request,
      actorUserId: params.actorUserId,
      reason: params.reason,
      metadata: params.metadata,
    });
    if (result.ok && !result.alreadyRevoked) {
      revokedCount += 1;
    }
  }

  return { revokedCount };
}

export async function revokeSignatureRequest(
  signatureRequestId: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCommercialRequestContextOrThrow();

  const request = await db.quoteSignatureRequest.findFirst({
    where: { id: signatureRequestId, organizationId: ctx.organizationId },
    include: { recipients: true },
  });
  if (!request) return { ok: false, error: "Signature request not found." };

  const result = await db.$transaction(async (tx) =>
    revokeSignatureRequestInTx(tx, {
      request,
      actorUserId: ctx.userId,
      reason,
    }),
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function recordSignerLinkCopied(
  signatureRequestId: string,
  recipientId: string,
): Promise<{ ok: boolean; error?: string; rawToken?: string }> {
  const ctx = await getCommercialRequestContextOrThrow();

  const recipient = await db.quoteSignatureRecipient.findFirst({
    where: {
      id: recipientId,
      signatureRequestId,
      organizationId: ctx.organizationId,
    },
    include: { signatureRequest: true },
  });
  if (!recipient) return { ok: false, error: "Recipient not found." };
  if (recipient.signatureRequest.status === QuoteSignatureRequestStatus.ACCEPTED) {
    return { ok: false, error: "Request already accepted." };
  }

  const { rawToken, tokenHash } = createSignerTokenPair();
  await db.quoteSignatureRecipient.update({
    where: { id: recipient.id },
    data: { tokenHash, tokenExpiresAt: recipient.signatureRequest.expiresAt },
  });

  await recordQuoteSignatureEvent(db, {
    organizationId: recipient.organizationId,
    quoteId: recipient.quoteId,
    signatureRequestId,
    recipientId,
    actorType: SignatureActorType.STAFF,
    actorUserId: ctx.userId,
    eventType: QuoteSignatureEventType.SIGNER_LINK_COPIED,
  });

  return { ok: true, rawToken };
}

export async function recordManualSignerLinkDelivery(
  signatureRequestId: string,
  recipientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCommercialRequestContextOrThrow();

  const recipient = await db.quoteSignatureRecipient.findFirst({
    where: {
      id: recipientId,
      signatureRequestId,
      organizationId: ctx.organizationId,
    },
    include: { signatureRequest: true },
  });
  if (!recipient) return { ok: false, error: "Recipient not found." };

  await db.$transaction(async (tx) => {
    await recordQuoteSignatureEvent(tx, {
      organizationId: recipient.organizationId,
      quoteId: recipient.quoteId,
      signatureRequestId,
      recipientId,
      actorType: SignatureActorType.STAFF,
      actorUserId: ctx.userId,
      eventType: QuoteSignatureEventType.SIGNER_LINK_MANUALLY_DELIVERED,
    });

    const request = recipient.signatureRequest;
    if (
      request.status === QuoteSignatureRequestStatus.DELIVERY_FAILED ||
      request.status === QuoteSignatureRequestStatus.READY_TO_SEND
    ) {
      await tx.quoteSignatureRequest.update({
        where: { id: request.id },
        data: {
          status: QuoteSignatureRequestStatus.SENT,
          sentAt: request.sentAt ?? new Date(),
        },
      });
    }

    await tx.quoteSignatureRecipient.update({
      where: { id: recipient.id },
      data: { status: QuoteSignatureRecipientStatus.SENT, sentAt: new Date() },
    });
  });

  return { ok: true };
}
