import {
  CustomerPortalEventType,
  type Prisma,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";

export type AppendCustomerPortalEventInput = {
  organizationId: string;
  customerId: string;
  jobId?: string | null;
  customerPortalAccessId?: string | null;
  portalIdentityId?: string | null;
  eventType: CustomerPortalEventType;
  resourceType?: string | null;
  resourceId?: string | null;
  metadataJson?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function appendCustomerPortalEvent(
  input: AppendCustomerPortalEventInput,
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.customerPortalEvent.create({
    data: {
      organizationId: input.organizationId,
      customerId: input.customerId,
      jobId: input.jobId ?? null,
      customerPortalAccessId: input.customerPortalAccessId ?? null,
      portalIdentityId: input.portalIdentityId ?? null,
      eventType: input.eventType,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      metadataJson: input.metadataJson ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function listCustomerSafePortalActivity(
  input: { organizationId: string; jobId: string; limit?: number },
) {
  const safeTypes: CustomerPortalEventType[] = [
    CustomerPortalEventType.QUOTE_VIEWED,
    CustomerPortalEventType.QUOTE_ACCEPTED,
    CustomerPortalEventType.QUOTE_CHANGE_REQUESTED,
    CustomerPortalEventType.CHANGE_ORDER_VIEWED,
    CustomerPortalEventType.CHANGE_ORDER_ACCEPTED,
    CustomerPortalEventType.APPOINTMENT_CONFIRMED,
    CustomerPortalEventType.DOCUMENT_UPLOADED,
    CustomerPortalEventType.PHOTO_UPLOADED,
    CustomerPortalEventType.PAYMENT_LINK_OPENED,
    CustomerPortalEventType.RESCHEDULE_REQUESTED,
    CustomerPortalEventType.AVAILABILITY_SUBMITTED,
    CustomerPortalEventType.ACCESS_NOTE_SUBMITTED,
    CustomerPortalEventType.QUESTION_SUBMITTED,
  ];

  return db.customerPortalEvent.findMany({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      eventType: { in: safeTypes },
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 20,
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      resourceType: true,
      resourceId: true,
      metadataJson: true,
    },
  });
}

export async function listPortalAuditEventsForJob(input: {
  organizationId: string;
  jobId: string;
  limit?: number;
}) {
  return db.customerPortalEvent.findMany({
    where: {
      organizationId: input.organizationId,
      jobId: input.jobId,
    },
    orderBy: { createdAt: "desc" },
    take: input.limit ?? 20,
    select: {
      id: true,
      eventType: true,
      createdAt: true,
      resourceType: true,
      resourceId: true,
      metadataJson: true,
      customerPortalAccess: {
        select: {
          customerContact: { select: { name: true, email: true } },
        },
      },
    },
  });
}

export function portalAuditEventLabel(eventType: CustomerPortalEventType): string {
  switch (eventType) {
    case CustomerPortalEventType.PORTAL_OPENED:
      return "Portal opened";
    case CustomerPortalEventType.MAGIC_LINK_SENT:
      return "Link sent";
    case CustomerPortalEventType.MAGIC_LINK_USED:
      return "Magic link used";
    case CustomerPortalEventType.QUOTE_VIEWED:
      return "Quote viewed";
    case CustomerPortalEventType.QUOTE_ACCEPTED:
      return "Quote accepted";
    case CustomerPortalEventType.QUOTE_CHANGE_REQUESTED:
      return "Quote change requested";
    case CustomerPortalEventType.CHANGE_ORDER_VIEWED:
      return "Change order viewed";
    case CustomerPortalEventType.CHANGE_ORDER_ACCEPTED:
      return "Change order accepted";
    case CustomerPortalEventType.PAYMENT_LINK_OPENED:
      return "Payment link opened";
    case CustomerPortalEventType.DOCUMENT_VIEWED:
      return "Document viewed";
    case CustomerPortalEventType.DOCUMENT_UPLOADED:
      return "Document uploaded";
    case CustomerPortalEventType.PHOTO_UPLOADED:
      return "Photo uploaded";
    case CustomerPortalEventType.APPOINTMENT_VIEWED:
      return "Appointment viewed";
    case CustomerPortalEventType.APPOINTMENT_CONFIRMED:
      return "Appointment confirmed";
    case CustomerPortalEventType.RESCHEDULE_REQUESTED:
      return "Reschedule requested";
    case CustomerPortalEventType.AVAILABILITY_SUBMITTED:
      return "Availability submitted";
    case CustomerPortalEventType.ACCESS_NOTE_SUBMITTED:
      return "Access note submitted";
    case CustomerPortalEventType.QUESTION_SUBMITTED:
      return "Question submitted";
    case CustomerPortalEventType.CONTRACTOR_RESPONSE_VIEWED:
      return "Contractor response viewed";
    case CustomerPortalEventType.ACCESS_REVOKED:
      return "Access revoked";
    case CustomerPortalEventType.ACCESS_EXPIRED:
      return "Access expired";
  }
}
