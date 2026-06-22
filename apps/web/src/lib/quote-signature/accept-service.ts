import { db } from "@/lib/db";
import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteSignatureArtifactKind,
  QuoteSignatureEventType,
  QuoteSignatureRecipientStatus,
  QuoteSignatureRequestStatus,
  QuoteStatus,
  SignatureActorType,
} from "@prisma/client";
import {
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/quote-checkpoint-snapshot";
import { notifyQuoteAccepted } from "@/lib/notifications";
import { parseFrozenSnapshotJson } from "./frozen-snapshot";
import { recordQuoteSignatureEvent } from "./event-service";
import { generateAndStoreFinalPacket } from "./artifact-service";
import {
  STANDARD_ACCEPTANCE_CONSENT_TEXT,
  STANDARD_ACCEPTANCE_CONSENT_VERSION,
} from "./consent";
import {
  hashSignerToken,
  isRecipientTokenValid,
  resolveQuoteSignatureRecipient,
} from "./recipient-token-service";

export type AcceptQuoteSignatureInput = {
  rawToken: string;
  acceptedByName: string;
  consentChecked: boolean;
  ip: string;
  userAgent: string | null;
};

export type AcceptQuoteSignatureResult =
  | { ok: true; alreadyAccepted?: boolean; quoteId: string }
  | { ok: false; error: string };

const SIGNABLE_REQUEST_STATUSES: QuoteSignatureRequestStatus[] = [
  QuoteSignatureRequestStatus.SENT,
  QuoteSignatureRequestStatus.PARTIALLY_VIEWED,
  QuoteSignatureRequestStatus.VIEWED,
  QuoteSignatureRequestStatus.DELIVERY_FAILED,
  QuoteSignatureRequestStatus.READY_TO_SEND,
];

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function namesMismatch(recipientName: string | null, typedName: string): boolean {
  if (!recipientName) return false;
  return normalizeName(recipientName).toLowerCase() !== normalizeName(typedName).toLowerCase();
}

export async function acceptQuoteViaSignatureToken(
  input: AcceptQuoteSignatureInput,
): Promise<AcceptQuoteSignatureResult> {
  if (!input.consentChecked) {
    return { ok: false, error: "You must agree to electronic acceptance before continuing." };
  }
  const acceptedByName = normalizeName(input.acceptedByName);
  if (acceptedByName.length < 2) {
    return { ok: false, error: "Please enter your full name to accept the proposal." };
  }

  const recipient = await resolveQuoteSignatureRecipient(input.rawToken);
  if (!recipient) {
    return { ok: false, error: "This link is no longer valid." };
  }

  const tokenValid = isRecipientTokenValid(recipient);
  if (!tokenValid.ok && tokenValid.reason === "accepted") {
    return { ok: true, alreadyAccepted: true, quoteId: recipient.quoteId };
  }
  if (!tokenValid.ok) {
    const msg =
      tokenValid.reason === "expired"
        ? "This link has expired."
        : "This link is no longer valid.";
    return { ok: false, error: msg };
  }

  const request = await db.quoteSignatureRequest.findUnique({
    where: { id: recipient.signatureRequestId },
  });
  if (!request || !SIGNABLE_REQUEST_STATUSES.includes(request.status)) {
    return { ok: false, error: "This quote is no longer awaiting approval." };
  }

  if (recipient.status === QuoteSignatureRecipientStatus.ACCEPTED || request.acceptedAt) {
    return { ok: true, alreadyAccepted: true, quoteId: recipient.quoteId };
  }

  const parsed = parseFrozenSnapshotJson(request.frozenSnapshotJson);
  if (!parsed.ok) {
    return { ok: false, error: "Unable to load quote snapshot." };
  }
  const document = parsed.document;
  const now = new Date();
  const nameMismatch = namesMismatch(recipient.recipientName, acceptedByName);

  const txResult = await db.$transaction(async (tx) => {
    const lockedRecipient = await tx.quoteSignatureRecipient.findUnique({
      where: { id: recipient.id },
    });
    const lockedRequest = await tx.quoteSignatureRequest.findUnique({
      where: { id: request.id },
    });
    if (!lockedRecipient || !lockedRequest) throw new Error("REQUEST_NOT_FOUND");
    if (lockedRecipient.status === QuoteSignatureRecipientStatus.ACCEPTED || lockedRequest.acceptedAt) {
      return { alreadyAccepted: true as const, quoteId: lockedRecipient.quoteId };
    }

    await recordQuoteSignatureEvent(tx, {
      organizationId: lockedRecipient.organizationId,
      quoteId: lockedRecipient.quoteId,
      signatureRequestId: lockedRequest.id,
      recipientId: lockedRecipient.id,
      actorType: SignatureActorType.CUSTOMER_SIGNER,
      eventType: QuoteSignatureEventType.CONSENT_CHECKED,
      ipAddress: input.ip,
      userAgent: input.userAgent,
      metadataJson: {
        consentVersion: STANDARD_ACCEPTANCE_CONSENT_VERSION,
        consentText: STANDARD_ACCEPTANCE_CONSENT_TEXT,
      },
    });

    await recordQuoteSignatureEvent(tx, {
      organizationId: lockedRecipient.organizationId,
      quoteId: lockedRecipient.quoteId,
      signatureRequestId: lockedRequest.id,
      recipientId: lockedRecipient.id,
      actorType: SignatureActorType.CUSTOMER_SIGNER,
      eventType: QuoteSignatureEventType.TYPED_NAME_SUBMITTED,
      ipAddress: input.ip,
      userAgent: input.userAgent,
      metadataJson: {
        acceptedByName,
        recipientName: lockedRecipient.recipientName,
        nameMismatch,
      },
    });

    if (nameMismatch) {
      await recordQuoteSignatureEvent(tx, {
        organizationId: lockedRecipient.organizationId,
        quoteId: lockedRecipient.quoteId,
        signatureRequestId: lockedRequest.id,
        recipientId: lockedRecipient.id,
        actorType: SignatureActorType.SYSTEM,
        eventType: QuoteSignatureEventType.TYPED_NAME_SUBMITTED,
        metadataJson: { kind: "SIGNER_NAME_MISMATCH", acceptedByName, recipientName: lockedRecipient.recipientName },
      });
    }

    let approvalCheckpointId = lockedRequest.approvalCheckpointId;
    if (!approvalCheckpointId) {
      const snapshotWire = request.frozenSnapshotJson;
      const aggregate = await tx.quoteCheckpoint.aggregate({
        where: {
          organizationId: lockedRecipient.organizationId,
          quoteId: lockedRecipient.quoteId,
          kind: QuoteCheckpointKind.APPROVAL,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;
      const approvalCheckpoint = await tx.quoteCheckpoint.create({
        data: {
          organizationId: lockedRecipient.organizationId,
          quoteId: lockedRecipient.quoteId,
          kind: QuoteCheckpointKind.APPROVAL,
          source: QuoteCheckpointSource.CUSTOMER_PORTAL,
          sequence: nextSequence,
          schemaVersion: QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
          snapshotJson: snapshotWire as Prisma.InputJsonValue,
          staffOnlyJson: {
            acceptedByName,
            signatureRequestId: lockedRequest.id,
            recipientId: lockedRecipient.id,
            consentVersion: STANDARD_ACCEPTANCE_CONSENT_VERSION,
          } as Prisma.InputJsonValue,
        },
      });
      approvalCheckpointId = approvalCheckpoint.id;
    }

    await tx.quoteSignatureRecipient.update({
      where: { id: lockedRecipient.id },
      data: {
        status: QuoteSignatureRecipientStatus.ACCEPTED,
        acceptedAt: now,
        acceptedByName,
        acceptedConsentAt: now,
        consentText: STANDARD_ACCEPTANCE_CONSENT_TEXT,
        consentVersion: STANDARD_ACCEPTANCE_CONSENT_VERSION,
        acceptedFromIp: input.ip,
        acceptedUserAgent: input.userAgent,
        tokenRevokedAt: now,
      },
    });

    await tx.quoteSignatureRequest.update({
      where: { id: lockedRequest.id },
      data: {
        status: QuoteSignatureRequestStatus.ACCEPTED,
        acceptedAt: now,
        approvalCheckpointId,
        finalPdfArtifactId: lockedRequest.finalPdfArtifactId ?? undefined,
      },
    });

    await tx.quote.update({
      where: { id: lockedRecipient.quoteId },
      data: { status: QuoteStatus.APPROVED },
    });

    await recordQuoteSignatureEvent(tx, {
      organizationId: lockedRecipient.organizationId,
      quoteId: lockedRecipient.quoteId,
      signatureRequestId: lockedRequest.id,
      recipientId: lockedRecipient.id,
      actorType: SignatureActorType.CUSTOMER_SIGNER,
      eventType: QuoteSignatureEventType.QUOTE_ACCEPTED,
      ipAddress: input.ip,
      userAgent: input.userAgent,
      metadataJson: { acceptedByName, nameMismatch },
    });

    const quote = await tx.quote.findUnique({
      where: { id: lockedRecipient.quoteId },
      select: { customerId: true, leadId: true },
    });

    return {
      alreadyAccepted: false as const,
      quoteId: lockedRecipient.quoteId,
      organizationId: lockedRecipient.organizationId,
      signatureRequestId: lockedRequest.id,
      recipientId: lockedRecipient.id,
      customerId: quote?.customerId ?? null,
      leadId: quote?.leadId ?? null,
      sentPdfSha256: lockedRequest.sentPdfSha256,
      frozenSnapshotSha256: lockedRequest.frozenSnapshotSha256,
      sentAt: lockedRequest.sentAt,
      existingFinalPdf: lockedRequest.finalPdfArtifactId,
    };
  });

  if (txResult.alreadyAccepted) {
    return { ok: true, alreadyAccepted: true, quoteId: txResult.quoteId };
  }

  if (!txResult.existingFinalPdf) {
    try {
      const events = await db.quoteSignatureEvent.findMany({
        where: { signatureRequestId: txResult.signatureRequestId },
        orderBy: { occurredAt: "asc" },
        take: 50,
      });
      const eventSummary = events.map(
        (e) => `${e.occurredAt.toISOString()} — ${e.eventType}`,
      );

      const acceptedAtIso = now.toISOString();
      const packets = await generateAndStoreFinalPacket(db, {
        organizationId: txResult.organizationId,
        quoteId: txResult.quoteId,
        signatureRequestId: txResult.signatureRequestId,
        recipientId: txResult.recipientId,
        document,
        acceptance: {
          acceptedByName,
          acceptedAtIso,
          ip: input.ip,
          userAgent: input.userAgent,
        },
        auditMetadata: {
          quoteId: txResult.quoteId,
          signatureRequestId: txResult.signatureRequestId,
          recipientId: txResult.recipientId,
          mode: "STANDARD_ACCEPTANCE",
          provider: "STRUXIENT",
          sentAtIso: txResult.sentAt?.toISOString() ?? acceptedAtIso,
          acceptedAtIso,
          acceptedByName,
          signerEmail: recipient.recipientEmail,
          ip: input.ip,
          userAgent: input.userAgent,
          consentText: STANDARD_ACCEPTANCE_CONSENT_TEXT,
          consentVersion: STANDARD_ACCEPTANCE_CONSENT_VERSION,
          consentAcceptedAtIso: acceptedAtIso,
          frozenSnapshotSha256: txResult.frozenSnapshotSha256 ?? "",
          sentPdfSha256: txResult.sentPdfSha256 ?? "",
          finalPdfSha256: "",
          eventSummary,
        },
        customerId: txResult.customerId,
        leadId: txResult.leadId,
      });

      await db.quoteSignatureRequest.update({
        where: { id: txResult.signatureRequestId },
        data: {
          finalPdfArtifactId: packets.finalPdfArtifactId,
          finalPdfSha256: packets.finalPdfSha256,
          auditPacketArtifactId: packets.auditPacketArtifactId,
          auditPacketSha256: packets.auditPacketSha256,
        },
      });

      await recordQuoteSignatureEvent(db, {
        organizationId: txResult.organizationId,
        quoteId: txResult.quoteId,
        signatureRequestId: txResult.signatureRequestId,
        recipientId: txResult.recipientId,
        actorType: SignatureActorType.SYSTEM,
        eventType: QuoteSignatureEventType.FINAL_PDF_GENERATED,
        metadataJson: {
          finalPdfSha256: packets.finalPdfSha256,
          auditPacketSha256: packets.auditPacketSha256,
        },
      });
    } catch (pdfError) {
      console.error("[acceptQuoteViaSignatureToken] Final packet generation failed:", pdfError);
    }
  }

  void notifyQuoteAccepted({
    organizationId: txResult.organizationId,
    quoteId: txResult.quoteId,
    acceptedByName,
    totalCents: document.totalCents,
  });

  return { ok: true, quoteId: txResult.quoteId };
}

export async function declineQuoteViaSignatureToken(params: {
  rawToken: string;
  reason?: string;
  ip: string;
  userAgent: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const recipient = await resolveQuoteSignatureRecipient(params.rawToken);
  if (!recipient) return { ok: false, error: "This link is no longer valid." };

  const tokenValid = isRecipientTokenValid(recipient);
  if (!tokenValid.ok) {
    return { ok: false, error: "This link is no longer valid." };
  }

  await db.$transaction(async (tx) => {
    await tx.quoteSignatureRecipient.update({
      where: { id: recipient.id },
      data: {
        status: QuoteSignatureRecipientStatus.DECLINED,
        declinedAt: new Date(),
        declineReason: params.reason?.trim() || null,
      },
    });
    await tx.quoteSignatureRequest.update({
      where: { id: recipient.signatureRequestId },
      data: {
        status: QuoteSignatureRequestStatus.DECLINED,
        declinedAt: new Date(),
      },
    });
    await recordQuoteSignatureEvent(tx, {
      organizationId: recipient.organizationId,
      quoteId: recipient.quoteId,
      signatureRequestId: recipient.signatureRequestId,
      recipientId: recipient.id,
      actorType: SignatureActorType.CUSTOMER_SIGNER,
      eventType: QuoteSignatureEventType.QUOTE_DECLINED,
      ipAddress: params.ip,
      userAgent: params.userAgent,
      metadataJson: params.reason ? { reason: params.reason.trim() } : undefined,
    });
  });

  return { ok: true };
}

export async function recordSignerView(params: {
  rawToken: string;
  ip: string;
  userAgent: string | null;
}): Promise<void> {
  const recipient = await resolveQuoteSignatureRecipient(params.rawToken);
  if (!recipient) return;

  const tokenValid = isRecipientTokenValid(recipient);
  if (!tokenValid.ok && tokenValid.reason !== "accepted") return;

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.quoteSignatureRecipient.update({
      where: { id: recipient.id },
      data: {
        lastViewedAt: now,
        status:
          recipient.status === QuoteSignatureRecipientStatus.PENDING ||
          recipient.status === QuoteSignatureRecipientStatus.SENT ||
          recipient.status === QuoteSignatureRecipientStatus.DELIVERED
            ? QuoteSignatureRecipientStatus.VIEWED
            : recipient.status,
      },
    });

    const request = await tx.quoteSignatureRequest.findUnique({
      where: { id: recipient.signatureRequestId },
      include: { recipients: { select: { status: true } } },
    });
    if (request && request.status !== QuoteSignatureRequestStatus.ACCEPTED) {
      const viewedCount = request.recipients.filter(
        (r) => r.status === QuoteSignatureRecipientStatus.VIEWED || r.id === recipient.id,
      ).length;
      const newStatus =
        viewedCount > 0 && viewedCount < request.recipients.length
          ? QuoteSignatureRequestStatus.PARTIALLY_VIEWED
          : QuoteSignatureRequestStatus.VIEWED;
      if (request.status !== newStatus) {
        await tx.quoteSignatureRequest.update({
          where: { id: request.id },
          data: { status: newStatus },
        });
      }
    }

    await recordQuoteSignatureEvent(tx, {
      organizationId: recipient.organizationId,
      quoteId: recipient.quoteId,
      signatureRequestId: recipient.signatureRequestId,
      recipientId: recipient.id,
      actorType: SignatureActorType.CUSTOMER_SIGNER,
      eventType: QuoteSignatureEventType.SIGNER_LINK_OPENED,
      ipAddress: params.ip,
      userAgent: params.userAgent,
    });
    await recordQuoteSignatureEvent(tx, {
      organizationId: recipient.organizationId,
      quoteId: recipient.quoteId,
      signatureRequestId: recipient.signatureRequestId,
      recipientId: recipient.id,
      actorType: SignatureActorType.CUSTOMER_SIGNER,
      eventType: QuoteSignatureEventType.QUOTE_VIEWED,
      ipAddress: params.ip,
      userAgent: params.userAgent,
    });
  });
}

export async function recordSignerPdfDownload(params: {
  rawToken: string;
  ip: string;
  userAgent: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const recipient = await resolveQuoteSignatureRecipient(params.rawToken);
  if (!recipient) return { ok: false, error: "Invalid link." };

  const artifact = await db.quoteSignatureArtifact.findFirst({
    where: {
      signatureRequestId: recipient.signatureRequestId,
      kind: QuoteSignatureArtifactKind.SENT_PDF,
    },
  });
  if (!artifact) return { ok: false, error: "PDF not available." };

  await recordQuoteSignatureEvent(db, {
    organizationId: recipient.organizationId,
    quoteId: recipient.quoteId,
    signatureRequestId: recipient.signatureRequestId,
    recipientId: recipient.id,
    actorType: SignatureActorType.CUSTOMER_SIGNER,
    eventType: QuoteSignatureEventType.PDF_DOWNLOADED,
    ipAddress: params.ip,
    userAgent: params.userAgent,
  });

  return { ok: true };
}

export { hashSignerToken };
