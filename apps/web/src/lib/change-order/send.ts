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
import { assertPaymentImpactReadyForSend } from "@/lib/change-order/payment-impact-gates";
import { parseChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";
import { assertChangeOrderCustomerAcceptReadyOrThrow } from "@/lib/change-order/change-order-customer-accept-readiness";
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

const SENDABLE_CHANGE_ORDER_STATUSES: ChangeOrderStatus[] = [
  ChangeOrderStatus.DRAFT,
  ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
];

const changeOrderSelectForSendValidation = {
  id: true,
  status: true,
  priceDeltaCents: true,
  paymentImpactJson: true,
  executionDeltaJson: true,
  baseJobPlanVersion: true,
  job: {
    select: {
      jobPlanVersion: true,
      scopeItems: {
        select: { id: true, executionRelevant: true, status: true },
      },
      tasks: {
        select: {
          id: true,
          status: true,
          hardSignal: true,
          requiresSignals: true,
          providesSignals: true,
          scopes: { select: { jobScopeItemId: true } },
        },
      },
    },
  },
} as const;

function assertStoredChangeOrderReadyForCustomerAccept(input: {
  status: ChangeOrderStatus;
  priceDeltaCents: number;
  paymentImpactJson: unknown;
  executionDeltaJson: unknown;
  baseJobPlanVersion: number;
  job: {
    jobPlanVersion: number;
    scopeItems: Array<{ id: string; executionRelevant: boolean; status: import("@prisma/client").JobScopeItemStatus }>;
    tasks: Array<{
      id: string;
      status: import("@prisma/client").JobTaskStatus;
      hardSignal: boolean;
      requiresSignals: string[];
      providesSignals: string[];
      scopes: Array<{ jobScopeItemId: string }>;
    }>;
  };
}): void {
  assertChangeOrderCustomerAcceptReadyOrThrow({
    status: input.status,
    priceDeltaCents: input.priceDeltaCents,
    paymentImpactJson: input.paymentImpactJson,
    executionDeltaJson: input.executionDeltaJson,
    baseJobPlanVersion: input.baseJobPlanVersion,
    currentJobPlanVersion: input.job.jobPlanVersion,
    scopeItems: input.job.scopeItems,
    tasks: input.job.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: task.hardSignal,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
    requireSentStatus: false,
  });
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
      status: { in: SENDABLE_CHANGE_ORDER_STATUSES },
    },
    select: {
      ...changeOrderSelectForCustomerCheckpoint,
      executionDeltaJson: true,
      baseJobPlanVersion: true,
      job: changeOrderSelectForSendValidation.job,
    },
  });

  if (!changeOrder) {
    throw new Error("CHANGE_ORDER_SEND_CHECKPOINT_RACE");
  }

  const paymentGate = assertPaymentImpactReadyForSend({
    priceDeltaCents: changeOrder.priceDeltaCents,
    paymentImpactJson: changeOrder.paymentImpactJson,
  });
  if (!paymentGate.ok) {
    throw new Error("CHANGE_ORDER_PAYMENT_IMPACT_REQUIRED");
  }

  assertStoredChangeOrderReadyForCustomerAccept(changeOrder);

  const document = changeOrderRowToCustomerPreviewDocument(changeOrder, organizationName);
  const parsedPaymentImpact = parseChangeOrderPaymentImpact(changeOrder.paymentImpactJson);
  const snapshotWire = serializeChangeOrderPreviewDocumentForCheckpoint(
    document,
    parsedPaymentImpact.ok ? parsedPaymentImpact.impact : null,
  );

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

async function loadSendableChangeOrderForSendValidation(
  tx: ExtendedTransactionClient,
  changeOrderId: string,
  organizationId: string,
) {
  const changeOrder = await tx.changeOrder.findFirst({
    where: {
      id: changeOrderId,
      organizationId,
      status: { in: SENDABLE_CHANGE_ORDER_STATUSES },
    },
    select: changeOrderSelectForSendValidation,
  });
  if (!changeOrder) {
    throw new Error("CHANGE_ORDER_SEND_STATUS_RACE");
  }
  return changeOrder;
}

export async function transitionChangeOrderToSent(
  tx: ExtendedTransactionClient,
  changeOrderId: string,
  organizationId: string,
  options: ChangeOrderSendOptions = {},
): Promise<{ shareToken: string; shareExpiresAt: Date | null }> {
  const now = new Date();
  const expiresAt = options.expiresInDays ? addDays(now, options.expiresInDays) : null;

  assertStoredChangeOrderReadyForCustomerAccept(
    await loadSendableChangeOrderForSendValidation(tx, changeOrderId, organizationId),
  );

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
      status: { in: SENDABLE_CHANGE_ORDER_STATUSES },
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
      if (e.message === "CHANGE_ORDER_PAYMENT_IMPACT_REQUIRED") {
        return {
          ok: false,
          error:
            "Choose and save payment terms in the commercial column before sending this Change Order.",
        };
      }
      if (e.message === "CHANGE_ORDER_UNREVIEWED_GENERATED_TASKS") {
        return {
          ok: false,
          error:
            "Confirm all generated task suggestions in work impact before sending this Change Order.",
        };
      }
      if (e.message === "CHANGE_ORDER_CUSTOMER_ACCEPT_NOT_READY") {
        return {
          ok: false,
          error:
            "Work impact must pass acceptance validation before sending this Change Order. Review work impact and try again.",
        };
      }
    }
    return { ok: false, error: "An unexpected error occurred while sending the Change Order." };
  }
}
