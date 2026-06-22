import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  Prisma,
  QuoteSignatureEventType,
  SignatureActorType,
  SignatureProvider,
} from "@prisma/client";

export type RecordSignatureEventInput = {
  organizationId: string;
  quoteId: string;
  signatureRequestId?: string;
  recipientId?: string;
  actorType: SignatureActorType;
  actorUserId?: string | null;
  eventType: QuoteSignatureEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  provider?: SignatureProvider | null;
  providerEventId?: string | null;
  metadataJson?: Prisma.InputJsonValue;
  occurredAt?: Date;
};

type DbClient = ExtendedTransactionClient | typeof db;

export async function recordQuoteSignatureEvent(
  client: DbClient,
  input: RecordSignatureEventInput,
): Promise<void> {
  if (input.provider && input.providerEventId) {
    const existing = await client.quoteSignatureEvent.findFirst({
      where: {
        provider: input.provider,
        providerEventId: input.providerEventId,
      },
      select: { id: true },
    });
    if (existing) return;
  }

  await client.quoteSignatureEvent.create({
    data: {
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      signatureRequestId: input.signatureRequestId,
      recipientId: input.recipientId,
      actorType: input.actorType,
      actorUserId: input.actorUserId ?? undefined,
      eventType: input.eventType,
      occurredAt: input.occurredAt ?? new Date(),
      ipAddress: input.ipAddress ?? undefined,
      userAgent: input.userAgent ?? undefined,
      provider: input.provider ?? undefined,
      providerEventId: input.providerEventId ?? undefined,
      metadataJson: input.metadataJson,
    },
  });
}
