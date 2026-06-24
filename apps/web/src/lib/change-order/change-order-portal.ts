import {
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  changeOrderRowToCustomerPreviewDocument,
  changeOrderSelectForCustomerCheckpoint,
  serializeChangeOrderPreviewDocumentForCheckpoint,
} from "@/lib/change-order-checkpoint-snapshot";
import { parseChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";
import { JobActivityType } from "@prisma/client";
import { recordJobActivity } from "@/lib/job-activity-helper";

export async function requestChangeOrderChangesForShareToken(input: {
  shareTokenId: string;
  message: string;
}): Promise<
  | { ok: true; changeOrderId: string; organizationId: string }
  | { ok: false; error: "TOKEN_INVALID" | "CHANGE_ORDER_NOT_SENT" }
> {
  return db.$transaction(async (tx) => {
    const shareToken = await tx.changeOrderShareToken.findFirst({
      where: { id: input.shareTokenId },
      include: {
        changeOrder: {
          select: {
            ...changeOrderSelectForCustomerCheckpoint,
            jobId: true,
            organization: { select: { name: true } },
          },
        },
      },
    });

    if (!shareToken) {
      return { ok: false as const, error: "TOKEN_INVALID" };
    }

    if (shareToken.changeOrder.status !== ChangeOrderStatus.SENT) {
      return { ok: false as const, error: "CHANGE_ORDER_NOT_SENT" };
    }

    const changeOrder = shareToken.changeOrder;
    const document = changeOrderRowToCustomerPreviewDocument(
      changeOrder,
      changeOrder.organization.name,
    );
    const parsedPaymentImpact = parseChangeOrderPaymentImpact(changeOrder.paymentImpactJson);
    const paymentImpact = parsedPaymentImpact.ok ? parsedPaymentImpact.impact : null;
    const aggregate = await tx.changeOrderCheckpoint.aggregate({
      where: {
        organizationId: changeOrder.organizationId,
        changeOrderId: changeOrder.id,
        kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
      },
      _max: { sequence: true },
    });

    await tx.changeOrderCheckpoint.create({
      data: {
        organizationId: changeOrder.organizationId,
        changeOrderId: changeOrder.id,
        kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
        source: ChangeOrderCheckpointSource.CUSTOMER_PORTAL,
        sequence: (aggregate._max.sequence ?? 0) + 1,
        schemaVersion: CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
        snapshotJson: serializeChangeOrderPreviewDocumentForCheckpoint(
          document,
          paymentImpact,
        ) as unknown as Prisma.InputJsonValue,
        staffOnlyJson: {
          message: input.message.trim(),
        } as Prisma.InputJsonValue,
        changeOrderUpdatedAtAtCapture: changeOrder.updatedAt,
      },
    });

    await tx.changeOrder.update({
      where: { id: changeOrder.id },
      data: { status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES },
    });

    await recordJobActivity(
      {
        organizationId: changeOrder.organizationId,
        jobId: changeOrder.jobId,
        type: JobActivityType.CHANGE_ORDER_REQUESTED_CHANGES,
        title: "Customer requested Change Order changes",
        details: input.message.trim(),
        entityType: "ChangeOrder",
        entityId: changeOrder.id,
        metadataJson: { changeOrderId: changeOrder.id, source: "customer_portal" },
      },
      tx,
    );

    return {
      ok: true as const,
      changeOrderId: changeOrder.id,
      organizationId: changeOrder.organizationId,
    };
  });
}
