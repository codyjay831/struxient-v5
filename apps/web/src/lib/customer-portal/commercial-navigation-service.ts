import {
  ChangeOrderStatus,
  CustomerPortalEventType,
  QuoteStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  createPublicAccessToken,
  hashPublicAccessToken,
} from "@/lib/public-access/public-token-crypto";
import { appendCustomerPortalEvent } from "./event-service";
import type { CustomerPortalAuthContext } from "./authorize";

async function rotateQuoteShareToken(input: {
  organizationId: string;
  quoteId: string;
}): Promise<string> {
  const rawToken = createPublicAccessToken();
  const tokenHash = hashPublicAccessToken(rawToken);

  const existing = await db.quoteShareToken.findUnique({
    where: { quoteId: input.quoteId },
  });

  if (existing) {
    await db.quoteShareToken.update({
      where: { quoteId: input.quoteId },
      data: {
        token: tokenHash,
        revokedAt: null,
      },
    });
  } else {
    await db.quoteShareToken.create({
      data: {
        organizationId: input.organizationId,
        quoteId: input.quoteId,
        token: tokenHash,
      },
    });
  }

  return rawToken;
}

async function rotateChangeOrderShareToken(input: {
  organizationId: string;
  changeOrderId: string;
}): Promise<string> {
  const rawToken = createPublicAccessToken();
  const tokenHash = hashPublicAccessToken(rawToken);

  const existing = await db.changeOrderShareToken.findUnique({
    where: { changeOrderId: input.changeOrderId },
  });

  if (existing) {
    await db.changeOrderShareToken.update({
      where: { changeOrderId: input.changeOrderId },
      data: {
        token: tokenHash,
        revokedAt: null,
      },
    });
  } else {
    await db.changeOrderShareToken.create({
      data: {
        organizationId: input.organizationId,
        changeOrderId: input.changeOrderId,
        token: tokenHash,
      },
    });
  }

  return rawToken;
}

export async function openQuoteFromPortal(
  session: CustomerPortalAuthContext,
  ipAddress?: string | null,
  userAgent?: string | null,
): Promise<{ redirectPath: string }> {
  const job = await db.job.findFirst({
    where: {
      id: session.jobId,
      organizationId: session.organizationId,
      customerId: session.customerId,
    },
    select: {
      quoteId: true,
      quote: { select: { id: true, status: true } },
    },
  });

  if (!job?.quoteId || job.quote.status !== QuoteStatus.SENT) {
    throw new Error("QUOTE_NOT_AVAILABLE");
  }

  const rawToken = await rotateQuoteShareToken({
    organizationId: session.organizationId,
    quoteId: job.quoteId,
  });

  await appendCustomerPortalEvent({
    organizationId: session.organizationId,
    customerId: session.customerId,
    jobId: session.jobId,
    customerPortalAccessId: session.customerPortalAccessId,
    portalIdentityId: session.portalIdentityId,
    eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
    resourceType: "QUOTE",
    resourceId: job.quoteId,
    metadataJson: { purpose: "QUOTE_VIEW", via: "portal_navigation" },
    ipAddress,
    userAgent,
  });

  return { redirectPath: `/q/${rawToken}` };
}

export async function openChangeOrderFromPortal(
  session: CustomerPortalAuthContext,
  changeOrderId: string,
  ipAddress?: string | null,
  userAgent?: string | null,
): Promise<{ redirectPath: string }> {
  const changeOrder = await db.changeOrder.findFirst({
    where: {
      id: changeOrderId,
      organizationId: session.organizationId,
      quote: { job: { id: session.jobId, customerId: session.customerId } },
      status: ChangeOrderStatus.SENT,
    },
    select: { id: true },
  });

  if (!changeOrder) {
    throw new Error("CHANGE_ORDER_NOT_AVAILABLE");
  }

  const rawToken = await rotateChangeOrderShareToken({
    organizationId: session.organizationId,
    changeOrderId: changeOrder.id,
  });

  await appendCustomerPortalEvent({
    organizationId: session.organizationId,
    customerId: session.customerId,
    jobId: session.jobId,
    customerPortalAccessId: session.customerPortalAccessId,
    portalIdentityId: session.portalIdentityId,
    eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
    resourceType: "CHANGE_ORDER",
    resourceId: changeOrder.id,
    metadataJson: { purpose: "CHANGE_ORDER_VIEW", via: "portal_navigation" },
    ipAddress,
    userAgent,
  });

  return { redirectPath: `/co/${rawToken}` };
}

/** Mint a fresh quote share URL for staff notifications (does not require portal session). */
export async function mintQuoteShareUrlForStaff(input: {
  organizationId: string;
  quoteId: string;
}): Promise<string> {
  const quote = await db.quote.findFirst({
    where: { id: input.quoteId, organizationId: input.organizationId },
    select: { status: true },
  });
  if (!quote || quote.status !== QuoteStatus.SENT) {
    throw new Error("QUOTE_NOT_AVAILABLE");
  }
  const rawToken = await rotateQuoteShareToken({
    organizationId: input.organizationId,
    quoteId: input.quoteId,
  });
  return `/q/${rawToken}`;
}

/** Mint a fresh change order share URL for staff notifications. */
export async function mintChangeOrderShareUrlForStaff(input: {
  organizationId: string;
  changeOrderId: string;
}): Promise<string> {
  const changeOrder = await db.changeOrder.findFirst({
    where: {
      id: input.changeOrderId,
      organizationId: input.organizationId,
      status: ChangeOrderStatus.SENT,
    },
    select: { id: true },
  });
  if (!changeOrder) {
    throw new Error("CHANGE_ORDER_NOT_AVAILABLE");
  }
  const rawToken = await rotateChangeOrderShareToken({
    organizationId: input.organizationId,
    changeOrderId: changeOrder.id,
  });
  return `/co/${rawToken}`;
}
