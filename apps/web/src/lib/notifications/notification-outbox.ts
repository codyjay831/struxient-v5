import { NotificationChannel, NotificationStatus, Prisma } from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";

export type EnqueueNotificationInput = {
  organizationId: string;
  userId?: string | null;
  kind: string;
  title: string;
  body?: string;
  channel?: NotificationChannel;
  sendAt?: Date;
  dedupeKey?: string;
  payloadJson?: Prisma.InputJsonValue;
};

export async function enqueueNotification(
  input: EnqueueNotificationInput,
  tx: ExtendedTransactionClient = db,
) {
  const createData = {
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    kind: input.kind,
    title: input.title,
    body: input.body,
    channel: input.channel ?? NotificationChannel.IN_APP,
    status: NotificationStatus.PENDING,
    sendAt: input.sendAt ?? null,
    dedupeKey: input.dedupeKey ?? null,
    payloadJson: input.payloadJson,
  };

  if (!input.dedupeKey) {
    return tx.notificationEvent.create({ data: createData });
  }

  const existing = await tx.notificationEvent.findFirst({
    where: {
      organizationId: input.organizationId,
      dedupeKey: input.dedupeKey,
    },
    select: { id: true },
  });

  if (existing) return existing;

  return tx.notificationEvent.create({ data: createData });
}

export async function markNotificationSent(
  notificationId: string,
  tx: ExtendedTransactionClient = db,
) {
  return tx.notificationEvent.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      failedAt: null,
      errorMessage: null,
    },
  });
}

export async function markNotificationFailed(
  notificationId: string,
  errorMessage: string,
  tx: ExtendedTransactionClient = db,
) {
  return tx.notificationEvent.update({
    where: { id: notificationId },
    data: {
      status: NotificationStatus.FAILED,
      failedAt: new Date(),
      errorMessage,
    },
  });
}

