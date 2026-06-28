"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyQuoteChangeRequested } from "@/lib/notifications";
import {
  acceptQuoteViaSignatureToken,
  declineQuoteViaSignatureToken,
  recordSignerPdfDownload,
  recordSignerView,
  submitQuoteChangeRequestViaSignatureToken,
} from "@/lib/quote-signature/accept-service";
import {
  parseFrozenSnapshotJson,
} from "@/lib/quote-signature/frozen-snapshot";
import type { QuoteCustomerPreviewDocument } from "@/lib/quote-customer-projection";
import {
  isRecipientTokenValid,
  resolveQuoteSignatureRecipient,
} from "@/lib/quote-signature/recipient-token-service";
import { QuoteSignatureArtifactKind, QuoteStatus } from "@prisma/client";
import { getStorageProvider, LocalStorageProvider } from "@/lib/storage";
import { readFile } from "fs/promises";
import path from "path";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

async function getClientMeta() {
  const headerList = await headers();
  return {
    ip: headerList.get("x-forwarded-for")?.split(",")[0] || "unknown",
    userAgent: headerList.get("user-agent") ?? null,
  };
}

export type SignerAcceptState = { error?: string; success?: boolean; alreadyAccepted?: boolean };
export type SignerChangeState = { error?: string; success?: boolean };
export type SignerDeclineState = { error?: string; success?: boolean };
type SignerPageData =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "revoked" }
  | {
      kind: "accepted";
      document?: QuoteCustomerPreviewDocument;
      isApproved?: true;
    }
  | {
      kind: "ready";
      document: QuoteCustomerPreviewDocument;
      recipientName: string | null;
      recipientEmail: string | null;
      quoteStatus: QuoteStatus;
      isApproved: boolean;
    };

export async function recordSignerViewAction(recipientToken: string): Promise<void> {
  const { ip, userAgent } = await getClientMeta();
  if (
    !(await checkRateLimit(`${recipientToken}:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "signer-view",
    }))
  ) {
    return;
  }
  await recordSignerView({ rawToken: recipientToken, ip, userAgent });
}

export async function acceptQuoteFromSignerTokenAction(
  recipientToken: string,
  _prevState: SignerAcceptState,
  formData: FormData,
): Promise<SignerAcceptState> {
  const acceptedByName = formData.get("acceptedByName") as string;
  const consentChecked = formData.get("consentChecked") === "on";
  const { ip, userAgent } = await getClientMeta();

  if (
    !(await checkRateLimit(`${recipientToken}:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "signer-accept",
    }))
  ) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  const result = await acceptQuoteViaSignatureToken({
    rawToken: recipientToken,
    acceptedByName,
    consentChecked,
    ip,
    userAgent,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath(`/q/sign/${recipientToken}`);
  revalidatePath(`/quotes/${result.quoteId}`);
  revalidatePath("/workstation");
  revalidatePath("/leads");
  return { success: true, alreadyAccepted: result.alreadyAccepted };
}

export async function declineQuoteFromSignerTokenAction(
  recipientToken: string,
  _prevState: SignerDeclineState,
  formData: FormData,
): Promise<SignerDeclineState> {
  const reason = (formData.get("reason") as string | null) ?? undefined;
  const { ip, userAgent } = await getClientMeta();

  if (
    !(await checkRateLimit(`${recipientToken}:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "signer-decline",
    }))
  ) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  const result = await declineQuoteViaSignatureToken({ rawToken: recipientToken, reason, ip, userAgent });
  if (!result.ok) return { error: result.error };
  return { success: true };
}

export async function requestQuoteChangesFromSignerAction(
  recipientToken: string,
  _prevState: SignerChangeState,
  formData: FormData,
): Promise<SignerChangeState> {
  const message = formData.get("message") as string;
  if (!message || message.trim().length < 5) {
    return { error: "Please provide a brief description of the changes you'd like to see." };
  }

  const { ip, userAgent } = await getClientMeta();
  if (
    !(await checkRateLimit(`${recipientToken}:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "signer-change",
    }))
  ) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  const result = await submitQuoteChangeRequestViaSignatureToken({
    rawToken: recipientToken,
    message,
    ip,
    userAgent,
  });
  if (!result.ok) return { error: result.error };

  const recipient = await resolveQuoteSignatureRecipient(recipientToken);
  if (recipient) {
    void notifyQuoteChangeRequested({
      organizationId: recipient.organizationId,
      quoteId: recipient.quoteId,
      message: message.trim(),
      submittedFromIp: ip,
    });
    revalidatePath(`/quotes/${recipient.quoteId}`);
  }
  revalidatePath("/workstation");
  revalidatePath("/leads");
  return { success: true };
}

export async function downloadSentPdfFromSignerAction(
  recipientToken: string,
): Promise<{ ok: boolean; error?: string; data?: Uint8Array; fileName?: string }> {
  const { ip, userAgent } = await getClientMeta();
  const recipient = await resolveQuoteSignatureRecipient(recipientToken);
  if (!recipient) return { ok: false, error: "Invalid link." };

  const tokenValid = isRecipientTokenValid(recipient);
  if (!tokenValid.ok && tokenValid.reason === "expired") {
    return { ok: false, error: "This link has expired." };
  }
  if (!tokenValid.ok && tokenValid.reason === "revoked") {
    return { ok: false, error: "This link is no longer valid." };
  }

  await recordSignerPdfDownload({ rawToken: recipientToken, ip, userAgent });

  const artifact = await db.quoteSignatureArtifact.findFirst({
    where: {
      signatureRequestId: recipient.signatureRequestId,
      kind: QuoteSignatureArtifactKind.SENT_PDF,
    },
  });
  if (!artifact) return { ok: false, error: "PDF not available." };

  const attachment = await db.attachment.findFirst({
    where: { id: artifact.attachmentId, organizationId: recipient.organizationId },
  });
  if (!attachment || attachment.status !== "READY") {
    return { ok: false, error: "PDF not available." };
  }

  const storage = getStorageProvider();
  if (storage instanceof LocalStorageProvider) {
    const fullPath = path.join(process.cwd(), "storage", attachment.fileKey);
    const data = await readFile(fullPath);
    return { ok: true, data: new Uint8Array(data), fileName: attachment.fileName };
  }

  return { ok: false, error: "PDF download is not available in this environment." };
}

export async function loadSignerPageData(recipientToken: string): Promise<SignerPageData> {
  const recipient = await resolveQuoteSignatureRecipient(recipientToken);
  if (!recipient) return { kind: "invalid" as const };

  const tokenValid = isRecipientTokenValid(recipient);
  if (!tokenValid.ok && tokenValid.reason === "accepted") {
    const parsedAccepted = parseFrozenSnapshotJson(
      (
        await db.quoteSignatureRequest.findUnique({
          where: { id: recipient.signatureRequestId },
        })
      )?.frozenSnapshotJson,
    );
    if (parsedAccepted.ok) {
      return {
        kind: "accepted" as const,
        document: parsedAccepted.document,
        isApproved: true,
      };
    }
    return { kind: "accepted" as const };
  }
  if (!tokenValid.ok) {
    return { kind: tokenValid.reason as "expired" | "revoked" };
  }

  const request = await db.quoteSignatureRequest.findUnique({
    where: { id: recipient.signatureRequestId },
  });
  if (!request) return { kind: "invalid" as const };

  const parsed = parseFrozenSnapshotJson(request.frozenSnapshotJson);
  if (!parsed.ok) return { kind: "invalid" as const };

  return {
    kind: "ready" as const,
    document: parsed.document,
    recipientName: recipient.recipientName,
    recipientEmail: recipient.recipientEmail,
    quoteStatus: await db.quote
      .findUnique({ where: { id: recipient.quoteId }, select: { status: true } })
      .then((q) => q?.status ?? QuoteStatus.SENT),
    isApproved: request.status === "ACCEPTED",
  };
}
