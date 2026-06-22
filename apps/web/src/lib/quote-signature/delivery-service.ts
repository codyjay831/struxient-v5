import { escapeHtml, escapeHtmlWithBreaks } from "@/lib/html-escape";
import { getResendFromAddress, getResendClient } from "@/lib/resend-from";
import { db } from "@/lib/db";
import {
  QuoteSignatureEventType,
  SignatureActorType,
  SignatureDeliveryChannel,
} from "@prisma/client";
import { recordQuoteSignatureEvent } from "./event-service";

export type SignatureEmailDeliveryInput = {
  organizationId: string;
  quoteId: string;
  signatureRequestId: string;
  recipientId: string;
  recipientEmail: string;
  recipientName?: string;
  organizationDisplayName: string;
  shareUrl: string;
  customMessage?: string;
  expiresAt?: Date | null;
};

export type SignatureEmailDeliveryResult =
  | { ok: true; providerMessageId: string | null; status: "queued" | "sent" }
  | { ok: false; reason: "not_configured" | "send_failed"; errorMessage: string };

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export async function sendSignatureEmail(
  input: SignatureEmailDeliveryInput,
): Promise<SignatureEmailDeliveryResult> {
  const resend = getResendClient();
  if (!resend) {
    await recordQuoteSignatureEvent(db, {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      signatureRequestId: input.signatureRequestId,
      recipientId: input.recipientId,
      actorType: SignatureActorType.SYSTEM,
      eventType: QuoteSignatureEventType.EMAIL_FAILED,
      metadataJson: { reason: "not_configured" },
    });
    await db.quoteSignatureDelivery.create({
      data: {
        organizationId: input.organizationId,
        quoteId: input.quoteId,
        signatureRequestId: input.signatureRequestId,
        recipientId: input.recipientId,
        channel: SignatureDeliveryChannel.EMAIL,
        provider: "resend",
        destinationMasked: maskEmail(input.recipientEmail),
        status: "not_configured",
        errorMessage: "RESEND_API_KEY is not configured.",
      },
    });
    return { ok: false, reason: "not_configured", errorMessage: "Email sending is not configured." };
  }

  const expiryText = input.expiresAt
    ? `This link expires on ${input.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
    : "This link does not expire.";

  const customMessageHtml = input.customMessage
    ? `<div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #2563eb; color: #374151; font-style: italic;">
        ${escapeHtmlWithBreaks(input.customMessage)}
      </div>`
    : "";

  try {
    await recordQuoteSignatureEvent(db, {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      signatureRequestId: input.signatureRequestId,
      recipientId: input.recipientId,
      actorType: SignatureActorType.SYSTEM,
      eventType: QuoteSignatureEventType.EMAIL_QUEUED,
    });

    const response = await resend.emails.send({
      from: getResendFromAddress(),
      to: input.recipientEmail,
      subject: `Your proposal from ${escapeHtml(input.organizationDisplayName)}`,
      html: `
        <h1>Your proposal is ready</h1>
        <p>Hi ${escapeHtml(input.recipientName || "there")},</p>
        <p>Your proposal from <strong>${escapeHtml(input.organizationDisplayName)}</strong> is ready to review and accept.</p>
        ${customMessageHtml}
        <p><a href="${input.shareUrl}">View and accept proposal</a></p>
        <p style="font-size: 14px; color: #666;">${expiryText}</p>
      `,
    });

    const providerMessageId = response.data?.id ?? null;

    await db.quoteSignatureDelivery.create({
      data: {
        organizationId: input.organizationId,
        quoteId: input.quoteId,
        signatureRequestId: input.signatureRequestId,
        recipientId: input.recipientId,
        channel: SignatureDeliveryChannel.EMAIL,
        provider: "resend",
        providerMessageId,
        destinationMasked: maskEmail(input.recipientEmail),
        status: "sent",
        completedAt: new Date(),
      },
    });

    await recordQuoteSignatureEvent(db, {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      signatureRequestId: input.signatureRequestId,
      recipientId: input.recipientId,
      actorType: SignatureActorType.SYSTEM,
      eventType: QuoteSignatureEventType.QUOTE_SENT_EMAIL,
      metadataJson: { providerMessageId },
    });

    return { ok: true, providerMessageId, status: "sent" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Email send failed.";
    await db.quoteSignatureDelivery.create({
      data: {
        organizationId: input.organizationId,
        quoteId: input.quoteId,
        signatureRequestId: input.signatureRequestId,
        recipientId: input.recipientId,
        channel: SignatureDeliveryChannel.EMAIL,
        provider: "resend",
        destinationMasked: maskEmail(input.recipientEmail),
        status: "failed",
        errorMessage,
      },
    });
    await recordQuoteSignatureEvent(db, {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      signatureRequestId: input.signatureRequestId,
      recipientId: input.recipientId,
      actorType: SignatureActorType.SYSTEM,
      eventType: QuoteSignatureEventType.EMAIL_FAILED,
      metadataJson: { errorMessage },
    });
    return { ok: false, reason: "send_failed", errorMessage };
  }
}
