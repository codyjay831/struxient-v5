import { CustomerPortalEventType } from "@prisma/client";
import { db } from "@/lib/db";
import { appendCustomerPortalEvent } from "./event-service";

export async function recordCommercialPortalEventForQuote(input: {
  quoteId: string;
  eventType:
    | typeof CustomerPortalEventType.QUOTE_VIEWED
    | typeof CustomerPortalEventType.QUOTE_ACCEPTED
    | typeof CustomerPortalEventType.QUOTE_CHANGE_REQUESTED;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const quote = await db.quote.findUnique({
    where: { id: input.quoteId },
    select: {
      organizationId: true,
      customerId: true,
      job: { select: { id: true } },
    },
  });
  if (!quote?.customerId) return;

  await appendCustomerPortalEvent({
    organizationId: quote.organizationId,
    customerId: quote.customerId,
    jobId: quote.job?.id ?? null,
    eventType: input.eventType,
    resourceType: "QUOTE",
    resourceId: input.quoteId,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

export async function recordCommercialPortalEventForChangeOrder(input: {
  changeOrderId: string;
  eventType:
    | typeof CustomerPortalEventType.CHANGE_ORDER_VIEWED
    | typeof CustomerPortalEventType.CHANGE_ORDER_ACCEPTED;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const changeOrder = await db.changeOrder.findUnique({
    where: { id: input.changeOrderId },
    select: {
      organizationId: true,
      quote: {
        select: {
          customerId: true,
          job: { select: { id: true } },
        },
      },
    },
  });
  const customerId = changeOrder?.quote.customerId;
  if (!changeOrder || !customerId) return;

  await appendCustomerPortalEvent({
    organizationId: changeOrder.organizationId,
    customerId,
    jobId: changeOrder.quote.job?.id ?? null,
    eventType: input.eventType,
    resourceType: "CHANGE_ORDER",
    resourceId: input.changeOrderId,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}
