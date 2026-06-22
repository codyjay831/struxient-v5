import { CustomerPortalEventType, JobScheduleEventStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { appendCustomerPortalEvent } from "./event-service";
import type { CustomerPortalAuthContext } from "./authorize";

export async function loadCustomerConfirmedScheduleEventIds(
  jobId: string,
): Promise<Set<string>> {
  const rows = await db.customerPortalEvent.findMany({
    where: {
      jobId,
      eventType: CustomerPortalEventType.APPOINTMENT_CONFIRMED,
    },
    select: { resourceId: true, metadataJson: true },
  });

  const ids = new Set<string>();
  for (const row of rows) {
    if (row.resourceId) ids.add(row.resourceId);
    const meta = row.metadataJson as { scheduleEventId?: string } | null;
    if (meta?.scheduleEventId) ids.add(meta.scheduleEventId);
  }
  return ids;
}

export async function confirmCustomerAppointment(input: {
  session: CustomerPortalAuthContext;
  scheduleEventId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const event = await db.jobScheduleEvent.findFirst({
    where: {
      id: input.scheduleEventId,
      jobId: input.session.jobId,
      organizationId: input.session.organizationId,
      customerVisible: true,
      status: {
        in: [JobScheduleEventStatus.CONFIRMED, JobScheduleEventStatus.TENTATIVE],
      },
    },
    select: { id: true, title: true },
  });
  if (!event) {
    throw new Error("SCHEDULE_NOT_FOUND");
  }

  const confirmed = await loadCustomerConfirmedScheduleEventIds(input.session.jobId);
  if (confirmed.has(event.id)) {
    return;
  }

  await appendCustomerPortalEvent({
    organizationId: input.session.organizationId,
    customerId: input.session.customerId,
    jobId: input.session.jobId,
    customerPortalAccessId: input.session.customerPortalAccessId,
    portalIdentityId: input.session.portalIdentityId,
    eventType: CustomerPortalEventType.APPOINTMENT_CONFIRMED,
    resourceType: "SCHEDULE_EVENT",
    resourceId: event.id,
    metadataJson: { scheduleEventId: event.id, title: event.title },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
}
