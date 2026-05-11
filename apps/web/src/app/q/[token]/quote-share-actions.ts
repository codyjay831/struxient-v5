"use server";

import { db } from "@/lib/db";
import {
  Prisma,
  QuoteCheckpointKind,
  QuoteCheckpointSource,
  QuoteStatus,
} from "@prisma/client";
import {
  serializeCustomerPreviewDocumentForCheckpoint,
  QUOTE_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  quoteRowToCustomerPreviewInput,
  quoteSelectForLiveCustomerPreviewPage,
} from "@/lib/quote-checkpoint-snapshot";
import { buildCustomerQuotePreviewDocument } from "@/lib/quote-customer-projection";
import { revalidatePath } from "next/cache";
import { notifyQuoteAccepted } from "@/lib/notifications";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";

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
    const result = await db.$transaction(async (tx) => {
      const shareToken = await tx.quoteShareToken.findUnique({
        where: { token },
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

      // Log the request as a checkpoint or comment (for now, we'll just log it to console/stub)
      console.log(`[Quote Change Request] Quote ${quote.id}: ${message}`);

      return { quoteId: quote.id, organizationId: quote.organizationId };
    });

    revalidatePath(`/quotes/${result.quoteId}`);
    revalidatePath("/workstation");
    revalidatePath("/sales");

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
  if (!(await checkRateLimit(ip, { windowMs: RATE_LIMIT_WINDOW_MS, max: MAX_REQUESTS_PER_WINDOW, keyPrefix: "quote-accept" }))) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const shareToken = await tx.quoteShareToken.findUnique({
        where: { token },
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
        },
      });

      return {
        quoteId: quote.id,
        organizationId: quote.organizationId,
        totalCents: document.totalCents,
      };
    });

    revalidatePath(`/quotes/${result.quoteId}`);
    revalidatePath("/workstation");
    revalidatePath("/sales");

    // Non-blocking notification
    void notifyQuoteAccepted({
      organizationId: result.organizationId,
      quoteId: result.quoteId,
      acceptedByName: acceptedByName.trim(),
      totalCents: result.totalCents,
    });

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

  const shareToken = await db.quoteShareToken.findUnique({
    where: { token },
    select: { quoteId: true, organizationId: true },
  });

  if (shareToken) {
    await db.$transaction([
      db.quoteShareToken.update({
        where: { token },
        data: { lastViewedAt: new Date() },
      }),
      db.quoteView.create({
        data: {
          organizationId: shareToken.organizationId,
          quoteId: shareToken.quoteId,
          token,
          ip,
          userAgent,
        },
      }),
    ]);
  }
}
