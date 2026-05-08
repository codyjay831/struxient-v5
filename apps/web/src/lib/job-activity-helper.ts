import { JobActivityType, Prisma } from "@prisma/client";
import { db } from "./db";

export type RecordJobActivityInput = {
  organizationId: string;
  jobId: string;
  type: JobActivityType;
  title: string;
  details?: string;
  entityType?: string;
  entityId?: string;
  metadataJson?: Prisma.InputJsonValue;
  actorUserId?: string;
};

/**
 * Internal server-side helper to record a job activity event.
 * Caller is responsible for verifying organizationId and jobId context.
 * 
 * Can be used within a Prisma transaction by passing a `tx` client.
 */
export async function recordJobActivity(
  input: RecordJobActivityInput,
  tx: Prisma.TransactionClient = db,
) {
  return await tx.jobActivity.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: input.type,
      title: input.title,
      details: input.details,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: input.metadataJson,
      actorUserId: input.actorUserId,
    },
  });
}
