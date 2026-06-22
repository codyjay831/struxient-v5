import {
  CustomerPortalEventType,
  CustomerRequestStatus,
  CustomerRequestType,
  type Prisma,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { appendCustomerPortalEvent } from "./event-service";
import type { CustomerPortalSessionContext } from "./session-service";

export type CreateCustomerRequestInput = {
  session: CustomerPortalSessionContext;
  type: CustomerRequestType;
  title: string;
  message: string;
  metadataJson?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const REQUEST_EVENT_MAP: Partial<Record<CustomerRequestType, CustomerPortalEventType>> = {
  ASK_QUESTION: CustomerPortalEventType.QUESTION_SUBMITTED,
  REQUEST_RESCHEDULE: CustomerPortalEventType.RESCHEDULE_REQUESTED,
  SUBMIT_AVAILABILITY: CustomerPortalEventType.AVAILABILITY_SUBMITTED,
  ADD_ACCESS_NOTE: CustomerPortalEventType.ACCESS_NOTE_SUBMITTED,
  UPLOAD_DOCUMENT: CustomerPortalEventType.DOCUMENT_UPLOADED,
  UPLOAD_PHOTO: CustomerPortalEventType.PHOTO_UPLOADED,
};

export async function createCustomerRequest(
  input: CreateCustomerRequestInput,
  tx?: ExtendedTransactionClient,
): Promise<{ id: string }> {
  const run = async (tx: ExtendedTransactionClient) => {
    const request = await tx.customerRequest.create({
      data: {
        organizationId: input.session.organizationId,
        customerId: input.session.customerId,
        jobId: input.session.jobId,
        customerPortalAccessId: input.session.customerPortalAccessId,
        type: input.type,
        status: CustomerRequestStatus.OPEN,
        title: input.title.trim(),
        message: input.message.trim(),
        metadataJson: input.metadataJson ?? undefined,
      },
    });

    const eventType = REQUEST_EVENT_MAP[input.type] ?? CustomerPortalEventType.QUESTION_SUBMITTED;
    await appendCustomerPortalEvent(
      {
        organizationId: input.session.organizationId,
        customerId: input.session.customerId,
        jobId: input.session.jobId,
        customerPortalAccessId: input.session.customerPortalAccessId,
        portalIdentityId: input.session.portalIdentityId,
        eventType,
        resourceType: "CUSTOMER_REQUEST",
        resourceId: request.id,
        metadataJson: input.metadataJson,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
      tx,
    );

    return { id: request.id };
  };

  if (tx) return run(tx);
  return db.$transaction(run);
}

export async function listOpenCustomerRequestsForJob(
  organizationId: string,
  jobId: string,
) {
  return db.customerRequest.findMany({
    where: {
      organizationId,
      jobId,
      status: { in: [CustomerRequestStatus.OPEN, CustomerRequestStatus.NEEDS_REVIEW] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      customerPortalAccess: {
        include: {
          customerContact: { select: { name: true, email: true } },
        },
      },
    },
  });
}

export async function resolveCustomerRequest(
  input: {
    requestId: string;
    organizationId: string;
    resolvedByMembershipId: string;
    status: CustomerRequestStatus;
    linkedTaskId?: string | null;
    linkedScheduleEventId?: string | null;
    resolutionNote?: string | null;
  },
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const client = tx ?? db;

  const existing = await client.customerRequest.findFirst({
    where: {
      id: input.requestId,
      organizationId: input.organizationId,
    },
    select: { metadataJson: true },
  });

  const priorMeta =
    existing?.metadataJson && typeof existing.metadataJson === "object" && !Array.isArray(existing.metadataJson)
      ? (existing.metadataJson as Record<string, unknown>)
      : {};

  const note = input.resolutionNote?.trim();
  const metadataJson =
    note != null && note.length > 0
      ? { ...priorMeta, resolutionNote: note }
      : existing?.metadataJson ?? undefined;

  await client.customerRequest.updateMany({
    where: {
      id: input.requestId,
      organizationId: input.organizationId,
    },
    data: {
      status: input.status,
      resolvedAt: new Date(),
      resolvedByMembershipId: input.resolvedByMembershipId,
      linkedTaskId: input.linkedTaskId ?? null,
      linkedScheduleEventId: input.linkedScheduleEventId ?? null,
      ...(metadataJson !== undefined ? { metadataJson } : {}),
    },
  });
}
