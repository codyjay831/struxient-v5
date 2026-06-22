"use server";

import { db } from "@/lib/db";
import {
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderStatus,
  CustomerPortalEventType,
  Prisma,
} from "@prisma/client";
import {
  CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  changeOrderRowToCustomerPreviewDocument,
  changeOrderSelectForCustomerCheckpoint,
  serializeChangeOrderPreviewDocumentForCheckpoint,
} from "@/lib/change-order-checkpoint-snapshot";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyChangeOrderAccepted } from "@/lib/notifications";
import { hashPublicAccessToken } from "@/lib/public-access/public-token-crypto";
import { resolveChangeOrderShareToken } from "@/lib/public-access/public-token-service";
import { auditPublicTokenEvent } from "@/lib/public-access/public-token-audit";
import { recordCommercialPortalEventForChangeOrder } from "@/lib/customer-portal/commercial-event-bridge";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

export type ChangeOrderAcceptState = {
  error?: string;
  success?: boolean;
};

export async function acceptChangeOrderFromTokenAction(
  token: string,
  _prevState: ChangeOrderAcceptState,
  formData: FormData,
): Promise<ChangeOrderAcceptState> {
  const acceptedByName = formData.get("acceptedByName") as string;
  if (!acceptedByName || acceptedByName.trim().length < 2) {
    return { error: "Please enter your full name to accept the Change Order." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const userAgent = headerList.get("user-agent") ?? null;

  if (
    !(await checkRateLimit(ip, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "change-order-accept",
    }))
  ) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  try {
    const resolvedShareToken = await resolveChangeOrderShareToken(token);
    const result = await db.$transaction(async (tx) => {
      const shareToken = await tx.changeOrderShareToken.findFirst({
        where: { id: resolvedShareToken?.id ?? "" },
        include: {
          changeOrder: {
            select: {
              ...changeOrderSelectForCustomerCheckpoint,
              organization: { select: { name: true } },
            },
          },
        },
      });

      if (
        !shareToken ||
        shareToken.revokedAt ||
        (shareToken.expiresAt && shareToken.expiresAt < new Date())
      ) {
        throw new Error("TOKEN_INVALID");
      }

      if (shareToken.changeOrder.status !== ChangeOrderStatus.SENT) {
        throw new Error("CHANGE_ORDER_NOT_SENT");
      }

      const changeOrder = shareToken.changeOrder;
      const organizationId = changeOrder.organizationId;

      const document = changeOrderRowToCustomerPreviewDocument(
        changeOrder,
        changeOrder.organization.name,
      );
      const snapshotWire = serializeChangeOrderPreviewDocumentForCheckpoint(document);

      const aggregate = await tx.changeOrderCheckpoint.aggregate({
        where: {
          organizationId,
          changeOrderId: changeOrder.id,
          kind: ChangeOrderCheckpointKind.ACCEPTANCE,
        },
        _max: { sequence: true },
      });
      const nextSequence = (aggregate._max.sequence ?? 0) + 1;

      await tx.changeOrderCheckpoint.create({
        data: {
          organizationId,
          changeOrderId: changeOrder.id,
          kind: ChangeOrderCheckpointKind.ACCEPTANCE,
          source: ChangeOrderCheckpointSource.CUSTOMER_PORTAL,
          sequence: nextSequence,
          schemaVersion: CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
          snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
          staffOnlyJson: {
            acceptedByName: acceptedByName.trim(),
          } as Prisma.InputJsonValue,
          changeOrderUpdatedAtAtCapture: changeOrder.updatedAt,
        },
      });

      await tx.changeOrder.update({
        where: { id: changeOrder.id },
        data: {
          status: ChangeOrderStatus.ACCEPTED,
          acceptedAt: new Date(),
          approvedAt: new Date(),
        },
      });

      await tx.changeOrderShareToken.update({
        where: { id: shareToken.id },
        data: {
          acceptedAt: new Date(),
          acceptedByName: acceptedByName.trim(),
          acceptedFromIp: ip,
          userAgent,
        },
      });

      return {
        changeOrderId: changeOrder.id,
        organizationId: changeOrder.organizationId,
        deltaCents: changeOrder.priceDeltaCents,
      };
    });

    revalidatePath(`/jobs`);
    revalidatePath("/workstation");

    void notifyChangeOrderAccepted({
      organizationId: result.organizationId,
      changeOrderId: result.changeOrderId,
      acceptedByName: acceptedByName.trim(),
      deltaCents: result.deltaCents,
    });
    auditPublicTokenEvent("change_order.accept", {
      changeOrderId: result.changeOrderId,
      organizationId: result.organizationId,
      ip,
    });
    void recordCommercialPortalEventForChangeOrder({
      changeOrderId: result.changeOrderId,
      eventType: CustomerPortalEventType.CHANGE_ORDER_ACCEPTED,
      ipAddress: ip,
      userAgent,
    });

    return { success: true };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "TOKEN_INVALID") {
        return { error: "This link is no longer valid. Please request a new one from the company." };
      }
      if (e.message === "CHANGE_ORDER_NOT_SENT") {
        return { error: "This Change Order is no longer awaiting acceptance." };
      }
    }
    return { error: "An unexpected error occurred. Please try again later." };
  }
}

export async function recordChangeOrderViewAction(token: string) {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const userAgent = headerList.get("user-agent") || "unknown";

  const shareToken = await resolveChangeOrderShareToken(token);

  if (shareToken) {
    await db.$transaction([
      db.changeOrderShareToken.update({
        where: { id: shareToken.id },
        data: { lastViewedAt: new Date() },
      }),
      db.changeOrderView.create({
        data: {
          organizationId: shareToken.organizationId,
          changeOrderId: shareToken.changeOrderId,
          token: hashPublicAccessToken(token),
          ip,
          userAgent,
        },
      }),
    ]);
    auditPublicTokenEvent("change_order.view", {
      changeOrderId: shareToken.changeOrderId,
      organizationId: shareToken.organizationId,
      ip,
    });
    void recordCommercialPortalEventForChangeOrder({
      changeOrderId: shareToken.changeOrderId,
      eventType: CustomerPortalEventType.CHANGE_ORDER_VIEWED,
      ipAddress: ip,
      userAgent,
    });
  }
}
