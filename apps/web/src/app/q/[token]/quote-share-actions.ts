"use server";

import { db } from "@/lib/db";
import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteStatus,
  CustomerPortalEventType,
} from "@prisma/client";
import {
  serializeCustomerPreviewDocumentForCheckpoint,
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForLiveCustomerPreviewPage,
} from "@/lib/quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "@/lib/quote-customer-projection";
import { revalidatePath } from "next/cache";
import { notifyQuoteAccepted, notifyQuoteChangeRequested } from "@/lib/notifications";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { renderQuoteAcceptancePdf } from "@/lib/quote-pdf";
import { getStorageProvider } from "@/lib/storage";
import { LocalStorageProvider } from "@/lib/storage/local-storage-provider";
import { AttachmentStatus } from "@prisma/client";
import { hashPublicAccessToken } from "@/lib/public-access/public-token-crypto";
import { resolveQuoteShareToken } from "@/lib/public-access/public-token-service";
import { auditPublicTokenEvent } from "@/lib/public-access/public-token-audit";
import { recordCommercialPortalEventForQuote } from "@/lib/customer-portal/commercial-event-bridge";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_WINDOW = 10;

export type QuoteAcceptState = {
  error?: string;
  success?: boolean;
};

export type QuoteRequestChangesState = {
  error?: string;
  success?: boolean;
};

export async function requestQuoteChangesAction(
  token: string,
  _prevState: QuoteRequestChangesState,
  formData: FormData,
): Promise<QuoteRequestChangesState> {
  const message = formData.get("message") as string;
  if (!message || message.trim().length < 5) {
    return { error: "Please provide a brief description of the changes you'd like to see." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (!(await checkRateLimit(ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW, keyPrefix: "quote-request-changes" }))) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  try {
    const resolvedShareToken = await resolveQuoteShareToken(token);
    const result = await db.$transaction(async (tx) => {
      const shareToken = await tx.quoteShareToken.findFirst({
        where: { id: resolvedShareToken?.id ?? "" },
        include: {
          quote: {
            select: {
              id: true,
              organizationId: true,
              status: true,
            },
          },
        },
      });

      if (!shareToken || shareToken.revokedAt || (shareToken.expiresAt && shareToken.expiresAt < new Date())) {
        throw new Error("TOKEN_INVALID");
      }

      // Allow requesting changes on SENT quotes
      if (shareToken.quote.status !== QuoteStatus.SENT) {
        throw new Error("QUOTE_NOT_SENT");
      }

      const quote = shareToken.quote;

      // Create change request record
      const requiresVisit = /\b(site|visit|measure|inspect|onsite)\b/i.test(message);
      await tx.quoteChangeRequest.create({
        data: {
          organizationId: quote.organizationId,
          quoteId: quote.id,
          token: hashPublicAccessToken(token),
          message: message.trim(),
          requiresVisit,
          submittedFromIp: ip,
          userAgent: headerList.get("user-agent") ?? null,
        },
      });

      return { quoteId: quote.id, organizationId: quote.organizationId, message: message.trim() };
    });

    revalidatePath(`/quotes/${result.quoteId}`);
    revalidatePath("/workstation");
    revalidatePath("/leads");

    // Notify staff
    void notifyQuoteChangeRequested({
      organizationId: result.organizationId,
      quoteId: result.quoteId,
      message: result.message,
      submittedFromIp: ip,
    });
    auditPublicTokenEvent("quote.request_changes", {
      quoteId: result.quoteId,
      organizationId: result.organizationId,
      ip,
    });
    void recordCommercialPortalEventForQuote({
      quoteId: result.quoteId,
      eventType: CustomerPortalEventType.QUOTE_CHANGE_REQUESTED,
      ipAddress: ip,
      userAgent: headerList.get("user-agent"),
    });

    return { success: true };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "TOKEN_INVALID") {
        return { error: "This link is no longer valid." };
      }
      if (e.message === "QUOTE_NOT_SENT") {
        return { error: "This quote is no longer awaiting approval." };
      }
    }
    return { error: "An unexpected error occurred." };
  }
}

export async function acceptQuoteFromTokenAction(
  token: string,
  _prevState: QuoteAcceptState,
  formData: FormData,
): Promise<QuoteAcceptState> {
  const acceptedByName = formData.get("acceptedByName") as string;
  if (!acceptedByName || acceptedByName.trim().length < 2) {
    return { error: "Please enter your full name to accept the proposal." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const userAgent = headerList.get("user-agent") ?? null;
  
  if (!(await checkRateLimit(ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW, keyPrefix: "quote-accept" }))) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  try {
    const resolvedShareToken = await resolveQuoteShareToken(token);
    const result = await db.$transaction(async (tx) => {
      const shareToken = await tx.quoteShareToken.findFirst({
        where: { id: resolvedShareToken?.id ?? "" },
        include: {
          quote: {
            select: {
              ...quoteSelectForLiveCustomerPreviewPage,
              organization: { select: { name: true } },
            },
          },
        },
      });

      if (!shareToken || shareToken.revokedAt || (shareToken.expiresAt && shareToken.expiresAt < new Date())) {
        throw new Error("TOKEN_INVALID");
      }

      if (shareToken.quote.status !== QuoteStatus.SENT) {
        throw new Error("QUOTE_NOT_SENT");
      }

      const quote = shareToken.quote;
      const organizationId = quote.organizationId;

      const input = quoteRowToCustomerPreviewInput(quote, organizationId);
      const { document, staffOnly } = buildCustomerQuotePreviewDocument(input, {
        organizationDisplayName: quote.organization.name,
      });

      const snapshotWire = serializeCustomerPreviewDocumentForCheckpoint(document);

      const aggregate = await tx.quoteCheckpoint.aggregate({
        where: {
          organizationId,
          quoteId: quote.id,
          kind: QuoteCheckpointKind.APPROVAL,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await tx.quoteCheckpoint.create({
        data: {
          organizationId,
          quoteId: quote.id,
          kind: QuoteCheckpointKind.APPROVAL,
          source: QuoteCheckpointSource.CUSTOMER_PORTAL,
          sequence: nextSequence,
          schemaVersion: QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
          snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
          staffOnlyJson: {
            anyLineUsesInternalDescriptionForTitle: staffOnly.anyLineUsesInternalDescriptionForTitle,
            acceptedByName: acceptedByName.trim(),
          } as Prisma.InputJsonValue,
          quoteUpdatedAtAtCapture: quote.updatedAt,
        },
      });

      await tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.APPROVED },
      });

      await tx.quoteShareToken.update({
        where: { id: shareToken.id },
        data: {
          acceptedAt: new Date(),
          acceptedByName: acceptedByName.trim(),
          acceptedFromIp: ip,
          userAgent,
        },
      });

      return {
        quoteId: quote.id,
        organizationId: quote.organizationId,
        totalCents: document.totalCents,
        document,
        customerId: quote.customerId,
        leadId: quote.leadId,
      };
    });

    const acceptedAtIso = new Date().toISOString();

    revalidatePath(`/quotes/${result.quoteId}`);
    revalidatePath("/workstation");
    revalidatePath("/leads");

    // Non-blocking notification
    void notifyQuoteAccepted({
      organizationId: result.organizationId,
      quoteId: result.quoteId,
      acceptedByName: acceptedByName.trim(),
      totalCents: result.totalCents,
    });
    auditPublicTokenEvent("quote.accept", {
      quoteId: result.quoteId,
      organizationId: result.organizationId,
      ip,
    });
    void recordCommercialPortalEventForQuote({
      quoteId: result.quoteId,
      eventType: CustomerPortalEventType.QUOTE_ACCEPTED,
      ipAddress: ip,
      userAgent,
    });

    // Generate and store signed PDF artifact
    try {
      const pdfBuffer = await renderQuoteAcceptancePdf(result.document, {
        acceptedByName: acceptedByName.trim(),
        acceptedAtIso,
        ip,
        userAgent,
      });

      const attachment = await db.attachment.create({
        data: {
          organizationId: result.organizationId,
          quoteId: result.quoteId,
          customerId: result.customerId,
          leadId: result.leadId,
          fileName: `quote_signed_${result.quoteId}.pdf`,
          fileKey: "PENDING", // Temporary
          contentType: "application/pdf",
          fileSize: pdfBuffer.length,
          description: "Quote Signed PDF",
          status: AttachmentStatus.PENDING,
        },
      });

      const storage = getStorageProvider();
      const fileKey = storage.createObjectKey({
        organizationId: result.organizationId,
        attachmentId: attachment.id,
        fileName: `quote_signed_${result.quoteId}.pdf`,
      });

      if (storage instanceof LocalStorageProvider) {
        await storage.writeObject(fileKey, pdfBuffer);
        await db.attachment.update({
          where: { id: attachment.id },
          data: {
            fileKey,
            status: AttachmentStatus.READY,
          },
        });
      } else {
        // Non-local providers (GCS) require a separate signed-URL upload flow;
        // we leave the attachment row in PENDING for now so it isn't silently
        // marked READY without a real object behind it.
        console.warn(
          "[acceptQuoteFromTokenAction] Skipping direct upload for non-local storage provider; attachment left PENDING.",
        );
      }
    } catch (pdfError) {
      console.error("[acceptQuoteFromTokenAction] PDF generation/storage failed:", pdfError);
      // We don't fail the whole action if PDF storage fails, but we log it.
      // The quote is still marked as APPROVED in the DB.
    }

    return { success: true };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "TOKEN_INVALID") {
        return { error: "This link is no longer valid. Please request a new one from the company." };
      }
      if (e.message === "QUOTE_NOT_SENT") {
        return { error: "This quote is no longer awaiting approval." };
      }
    }
    return { error: "An unexpected error occurred. Please try again later." };
  }
}

export async function recordQuoteViewAction(token: string) {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const userAgent = headerList.get("user-agent") || "unknown";

  if (
    !(await checkRateLimit(`${token}:${ip}`, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "quote-view",
    }))
  ) {
    return;
  }

  const shareToken = await resolveQuoteShareToken(token);

  if (shareToken) {
    await db.$transaction([
      db.quoteShareToken.update({
        where: { id: shareToken.id },
        data: { lastViewedAt: new Date() },
      }),
      db.quoteView.create({
        data: {
          organizationId: shareToken.organizationId,
          quoteId: shareToken.quoteId,
          token: hashPublicAccessToken(token),
          ip,
          userAgent,
        },
      }),
    ]);
    auditPublicTokenEvent("quote.view", {
      quoteId: shareToken.quoteId,
      organizationId: shareToken.organizationId,
      ip,
    });
    void recordCommercialPortalEventForQuote({
      quoteId: shareToken.quoteId,
      eventType: CustomerPortalEventType.QUOTE_VIEWED,
      ipAddress: ip,
      userAgent,
    });
  }
}
