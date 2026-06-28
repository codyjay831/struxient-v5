import {
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderStatus,
  JobActivityType,
  Prisma,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  changeOrderRowToCustomerPreviewDocument,
  changeOrderSelectForCustomerCheckpoint,
  serializeChangeOrderPreviewDocumentForCheckpoint,
} from "@/lib/change-order-checkpoint-snapshot";
import {
  deriveChangeOrderCustomerAcceptReadiness,
  type ChangeOrderCustomerAcceptReadinessInput,
} from "@/lib/change-order/change-order-customer-accept-readiness";
import { parseChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";
import { recordJobActivity } from "@/lib/job-activity-helper";

export const CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE = "customer_office_note" as const;
export const CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES =
  "formal_change_request" as const;

const changeOrderSelectForPortalShareToken = {
  ...changeOrderSelectForCustomerCheckpoint,
  jobId: true,
  baseJobPlanVersion: true,
  executionDeltaJson: true,
  paymentImpactJson: true,
  priceDeltaCents: true,
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
  organization: { select: { name: true } },
} as const;

type PortalShareTokenChangeOrder = Prisma.ChangeOrderGetPayload<{
  select: typeof changeOrderSelectForPortalShareToken;
}>;

function toCustomerAcceptReadinessInput(
  changeOrder: PortalShareTokenChangeOrder,
): ChangeOrderCustomerAcceptReadinessInput {
  return {
    status: changeOrder.status,
    priceDeltaCents: changeOrder.priceDeltaCents,
    zeroDollarPolicyClass: changeOrder.zeroDollarPolicyClass,
    paymentImpactJson: changeOrder.paymentImpactJson,
    executionDeltaJson: changeOrder.executionDeltaJson,
    baseJobPlanVersion: changeOrder.baseJobPlanVersion,
    currentJobPlanVersion: changeOrder.job.jobPlanVersion,
    scopeItems: changeOrder.job.scopeItems,
    tasks: changeOrder.job.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: task.hardSignal,
      requiresSignals: task.requiresSignals,
      providesSignals: task.providesSignals,
      jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
    })),
  };
}

async function loadChangeOrderForPortalShareToken(
  shareTokenId: string,
): Promise<
  | { ok: true; shareToken: { id: string }; changeOrder: PortalShareTokenChangeOrder }
  | { ok: false; error: "TOKEN_INVALID" }
> {
  const shareToken = await db.changeOrderShareToken.findFirst({
    where: { id: shareTokenId },
    include: {
      changeOrder: {
        select: changeOrderSelectForPortalShareToken,
      },
    },
  });

  if (!shareToken) {
    return { ok: false as const, error: "TOKEN_INVALID" };
  }

  return {
    ok: true as const,
    shareToken: { id: shareToken.id },
    changeOrder: shareToken.changeOrder,
  };
}

function assertFormalChangeOrderResponseReady(changeOrder: PortalShareTokenChangeOrder): void {
  if (changeOrder.status !== ChangeOrderStatus.SENT) {
    throw new Error("CHANGE_ORDER_NOT_SENT");
  }
  const acceptReady = deriveChangeOrderCustomerAcceptReadiness(
    toCustomerAcceptReadinessInput(changeOrder),
  );
  if (!acceptReady.canAccept) {
    throw new Error("CHANGE_ORDER_NOT_RESPONSE_READY");
  }
}

function assertOfficeNoteAllowed(changeOrder: PortalShareTokenChangeOrder): void {
  if (changeOrder.status !== ChangeOrderStatus.SENT) {
    throw new Error("CHANGE_ORDER_NOT_SENT");
  }
  const acceptReady = deriveChangeOrderCustomerAcceptReadiness(
    toCustomerAcceptReadinessInput(changeOrder),
  );
  if (acceptReady.canAccept) {
    throw new Error("CHANGE_ORDER_OFFICE_NOTE_NOT_ALLOWED");
  }
}

async function createPortalCheckpoint(input: {
  changeOrder: PortalShareTokenChangeOrder;
  kind: ChangeOrderCheckpointKind;
  portalAction:
    | typeof CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE
    | typeof CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES;
  message: string;
  tx: ExtendedTransactionClient;
}): Promise<void> {
  const { changeOrder, kind, portalAction, message, tx } = input;
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
      kind,
    },
    _max: { sequence: true },
  });

  await tx.changeOrderCheckpoint.create({
    data: {
      organizationId: changeOrder.organizationId,
      changeOrderId: changeOrder.id,
      kind,
      source: ChangeOrderCheckpointSource.CUSTOMER_PORTAL,
      sequence: (aggregate._max.sequence ?? 0) + 1,
      schemaVersion: CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
      snapshotJson: serializeChangeOrderPreviewDocumentForCheckpoint(
        document,
        paymentImpact,
      ) as unknown as Prisma.InputJsonValue,
      staffOnlyJson: {
        portalAction,
        message: message.trim(),
      } as Prisma.InputJsonValue,
      changeOrderUpdatedAtAtCapture: changeOrder.updatedAt,
    },
  });
}

export async function requestChangeOrderChangesForShareToken(input: {
  shareTokenId: string;
  message: string;
}): Promise<
  | { ok: true; changeOrderId: string; organizationId: string }
  | { ok: false; error: "TOKEN_INVALID" | "CHANGE_ORDER_NOT_SENT" | "CHANGE_ORDER_NOT_RESPONSE_READY" }
> {
  return db.$transaction(async (tx) => {
    const loaded = await tx.changeOrderShareToken.findFirst({
      where: { id: input.shareTokenId },
      include: {
        changeOrder: {
          select: changeOrderSelectForPortalShareToken,
        },
      },
    });

    if (!loaded) {
      return { ok: false as const, error: "TOKEN_INVALID" };
    }

    try {
      assertFormalChangeOrderResponseReady(loaded.changeOrder);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CHANGE_ORDER_NOT_SENT") {
          return { ok: false as const, error: "CHANGE_ORDER_NOT_SENT" };
        }
        if (error.message === "CHANGE_ORDER_NOT_RESPONSE_READY") {
          return { ok: false as const, error: "CHANGE_ORDER_NOT_RESPONSE_READY" };
        }
      }
      throw error;
    }

    const changeOrder = loaded.changeOrder;

    await createPortalCheckpoint({
      changeOrder,
      kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
      portalAction: CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES,
      message: input.message,
      tx,
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
        metadataJson: {
          changeOrderId: changeOrder.id,
          source: "customer_portal",
          portalAction: CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES,
        },
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

export async function sendChangeOrderOfficeNoteForShareToken(input: {
  shareTokenId: string;
  message: string;
}): Promise<
  | { ok: true; changeOrderId: string; organizationId: string }
  | {
      ok: false;
      error:
        | "TOKEN_INVALID"
        | "CHANGE_ORDER_NOT_SENT"
        | "CHANGE_ORDER_OFFICE_NOTE_NOT_ALLOWED";
    }
> {
  return db.$transaction(async (tx) => {
    const loaded = await tx.changeOrderShareToken.findFirst({
      where: { id: input.shareTokenId },
      include: {
        changeOrder: {
          select: changeOrderSelectForPortalShareToken,
        },
      },
    });

    if (!loaded) {
      return { ok: false as const, error: "TOKEN_INVALID" };
    }

    try {
      assertOfficeNoteAllowed(loaded.changeOrder);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "CHANGE_ORDER_NOT_SENT") {
          return { ok: false as const, error: "CHANGE_ORDER_NOT_SENT" };
        }
        if (error.message === "CHANGE_ORDER_OFFICE_NOTE_NOT_ALLOWED") {
          return { ok: false as const, error: "CHANGE_ORDER_OFFICE_NOTE_NOT_ALLOWED" };
        }
      }
      throw error;
    }

    const changeOrder = loaded.changeOrder;

    await createPortalCheckpoint({
      changeOrder,
      kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
      portalAction: CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE,
      message: input.message,
      tx,
    });

    await recordJobActivity(
      {
        organizationId: changeOrder.organizationId,
        jobId: changeOrder.jobId,
        type: JobActivityType.CHANGE_ORDER_NEEDS_EXECUTION_REVIEW,
        title: "Customer note — Change Order approval unavailable",
        details: input.message.trim(),
        entityType: "ChangeOrder",
        entityId: changeOrder.id,
        metadataJson: {
          changeOrderId: changeOrder.id,
          source: "customer_portal",
          portalAction: CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE,
        },
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

export { loadChangeOrderForPortalShareToken, toCustomerAcceptReadinessInput };
