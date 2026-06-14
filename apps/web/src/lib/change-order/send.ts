import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderStatus,
  Prisma,
} from "@prisma/client";
import { addDays } from "date-fns";
import {
  CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  changeOrderRowToCustomerPreviewDocument,
  changeOrderSelectForCustomerCheckpoint,
  serializeChangeOrderPreviewDocumentForCheckpoint,
  type ChangeOrderCheckpointSnapshotWire,
  type ChangeOrderCheckpointStaffOnlyWire,
} from "@/lib/change-order-checkpoint-snapshot";
import { notifyChangeOrderSent } from "@/lib/notifications";
import { getRequestContextOrThrow } from "@/lib/auth-context";
import { createPublicAccessToken, hashPublicAccessToken } from "@/lib/public-access/public-token-crypto";

export interface ChangeOrderSendOptions {
  expiresInDays?: number | null;
  recipients?: { email: string; name?: string }[];
  customMessage?: string;
}

export interface ChangeOrderSendResult {
  ok: boolean;
  error?: string;
}

export async function captureChangeOrderSendCheckpoint(
  tx: ExtendedTransactionClient,
  changeOrderId: string,
  organizationId: string,
  organizationName: string,
  options: ChangeOrderSendOptions = {},
): Promise<{ snapshotWire: ChangeOrderCheckpointSnapshotWire; staffOnly: ChangeOrderCheckpointStaffOnlyWire; changeOrderUpdatedAt: Date }> {
  const changeOrder = await tx.changeOrder.findFirst({
    where: {
      id: changeOrderId,
      organizationId,
      status: ChangeOrderStatus.DRAFT,
    },
    select: changeOrderSelectForCustomerCheckpoint,
  });

  if (!changeOrder) {
    throw new Error("CHANGE_ORDER_SEND_CHECKPOINT_RACE");
  }

  const document = changeOrderRowToCustomerPreviewDocument(changeOrder, organizationName);
  const snapshotWire = serializeChangeOrderPreviewDocumentForCheckpoint(document);

  const aggregate = await tx.changeOrderCheckpoint.aggregate({
    where: {
      organizationId,
      changeOrderId,
      kind: ChangeOrderCheckpointKind.SEND,
    },
    _max: { sequence: true },
  });
  const nextSequence = (aggregate._max.sequence ?? 0) + 1;

  await tx.changeOrderCheckpoint.create({
    data: {
      organizationId,
      changeOrderId,
      kind: ChangeOrderCheckpointKind.SEND,
      source: ChangeOrderCheckpointSource.STAFF,
      sequence: nextSequence,
      schemaVersion: CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
      snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
      staffOnlyJson: {
        recipients: options.recipients,
        customMessage: options.customMessage,
      } as Prisma.InputJsonValue,
      changeOrderUpdatedAtAtCapture: changeOrder.updatedAt,
    },
  });

  return { snapshotWire, staffOnly: {}, changeOrderUpdatedAt: changeOrder.updatedAt };
}

export async function transitionChangeOrderToSent(
  tx: ExtendedTransactionClient,
  changeOrderId: string,
  organizationId: string,
  options: ChangeOrderSendOptions = {},
): Promise<{ shareToken: string; shareExpiresAt: Date | null }> {
  const now = new Date();
  const expiresAt = options.expiresInDays ? addDays(now, options.expiresInDays) : null;

  const existingToken = await tx.changeOrderShareToken.findUnique({
    where: { changeOrderId },
  });

  let shareToken: string;
  if (!existingToken) {
    shareToken = createPublicAccessToken();
    await tx.changeOrderShareToken.create({
      data: {
        organizationId,
        changeOrderId,
        token: hashPublicAccessToken(shareToken),
        expiresAt,
      },
    });
  } else {
    shareToken = createPublicAccessToken();
    await tx.changeOrderShareToken.update({
      where: { changeOrderId },
      data: { token: hashPublicAccessToken(shareToken), expiresAt },
    });
  }

  const statusUpdate = await tx.changeOrder.updateMany({
    where: {
      id: changeOrderId,
      organizationId,
      status: ChangeOrderStatus.DRAFT,
    },
    data: {
      status: ChangeOrderStatus.SENT,
      lastSentEmailAt: now,
    },
  });
  if (statusUpdate.count !== 1) {
    throw new Error("CHANGE_ORDER_SEND_STATUS_RACE");
  }

  return { shareToken, shareExpiresAt: expiresAt };
}

export async function enqueueChangeOrderSentNotification(
  changeOrderId: string,
  shareToken: string,
  shareExpiresAt: Date | null,
  organizationId: string,
  organizationName: string,
  options: ChangeOrderSendOptions = {},
): Promise<void> {
  const changeOrder = await db.changeOrder.findUnique({
    where: { id: changeOrderId },
    select: {
      quote: {
        select: {
          customer: { select: { displayName: true, email: true } },
          lead: { select: { contact: true } },
        },
      },
    },
  });

  let recipients = options.recipients;
  if (!recipients || recipients.length === 0) {
    const contact = (changeOrder?.quote?.lead?.contact ?? {}) as Record<string, unknown>;
    const fallbackEmail =
      changeOrder?.quote?.customer?.email ??
      (typeof contact.email === "string" ? contact.email : null);
    const fallbackName =
      changeOrder?.quote?.customer?.displayName ??
      (typeof contact.name === "string" ? contact.name : "Customer");
    if (fallbackEmail) {
      recipients = [{ email: fallbackEmail, name: fallbackName }];
    }
  }

  if (recipients && recipients.length > 0) {
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/co/${shareToken}`;
    void notifyChangeOrderSent({
      organizationId,
      changeOrderId,
      recipients,
      customMessage: options.customMessage,
      organizationDisplayName: organizationName,
      shareUrl,
      expiresAt: shareExpiresAt,
    });
  }
}

export async function sendChangeOrder(
  changeOrderId: string,
  options: ChangeOrderSendOptions = {},
): Promise<ChangeOrderSendResult> {
  const ctx = await getRequestContextOrThrow();
  const id = changeOrderId.trim();

  try {
    const { shareToken, shareExpiresAt } = await db.$transaction(async (tx) => {
      await captureChangeOrderSendCheckpoint(tx, id, ctx.organizationId, ctx.organizationName, options);
      return await transitionChangeOrderToSent(tx, id, ctx.organizationId, options);
    });

    await enqueueChangeOrderSentNotification(
      id,
      shareToken,
      shareExpiresAt,
      ctx.organizationId,
      ctx.organizationName,
      options,
    );
    return { ok: true };
  } catch (e) {
    console.error("Failed to send change order", e);
    if (e instanceof Error) {
      if (e.message === "CHANGE_ORDER_SEND_CHECKPOINT_RACE") {
        return { ok: false, error: "This Change Order changed state while sending. Refresh and try again." };
      }
      if (e.message === "CHANGE_ORDER_SEND_STATUS_RACE") {
        return { ok: false, error: "This Change Order could not be marked sent. Refresh and try again." };
      }
    }
    return { ok: false, error: "An unexpected error occurred while sending the Change Order." };
  }
}
