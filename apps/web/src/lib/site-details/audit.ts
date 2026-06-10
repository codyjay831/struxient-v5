import { ServiceLocationAuditType, type PrismaClient } from "@prisma/client";

type AuditDb = Pick<PrismaClient, "serviceLocationAuditEvent">;

export async function appendServiceLocationAuditEvent(
  db: AuditDb,
  params: {
    organizationId: string;
    serviceLocationId: string;
    actorUserId: string | null;
    eventType: ServiceLocationAuditType;
    oldValue: unknown;
    newValue: unknown;
    sourceReason: string;
  },
) {
  await db.serviceLocationAuditEvent.create({
    data: {
      organizationId: params.organizationId,
      serviceLocationId: params.serviceLocationId,
      actorUserId: params.actorUserId,
      eventType: params.eventType,
      oldValueJson: params.oldValue as never,
      newValueJson: params.newValue as never,
      sourceReason: params.sourceReason,
    },
  });
}
