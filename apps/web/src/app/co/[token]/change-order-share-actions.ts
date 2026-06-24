"use server";

import { db } from "@/lib/db";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderStatus,
  CustomerPortalEventType,
  ExecutionPlanRevisionKind,
  ExecutionPlanRevisionStatus,
  JobActivityType,
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
import { requestChangeOrderChangesForShareToken } from "@/lib/change-order/change-order-portal";
import { validateChangeOrderExecutionDelta } from "@/lib/change-order/execution-delta-validation";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { canCustomerAcceptChangeOrder } from "@/lib/change-order/change-order-commercial-rules";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

export type ChangeOrderAcceptState = {
  error?: string;
  success?: boolean;
};

export type ChangeOrderRequestChangesState = {
  error?: string;
  success?: boolean;
};

export async function requestChangeOrderChangesAction(
  token: string,
  _prevState: ChangeOrderRequestChangesState,
  formData: FormData,
): Promise<ChangeOrderRequestChangesState> {
  const message = formData.get("message") as string;
  if (!message || message.trim().length < 5) {
    return { error: "Please provide a brief description of the requested changes." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] || "unknown";

  if (
    !(await checkRateLimit(ip, {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: MAX_REQUESTS_PER_WINDOW,
      keyPrefix: "change-order-request-changes",
    }))
  ) {
    return { error: "Too many requests. Please try again in an hour." };
  }

  try {
    const resolvedShareToken = await resolveChangeOrderShareToken(token);
    if (!resolvedShareToken) {
      return { error: "This link is no longer valid. Please request a new one from the company." };
    }

    const result = await requestChangeOrderChangesForShareToken({
      shareTokenId: resolvedShareToken.id,
      message: message.trim(),
    });

    if (!result.ok) {
      if (result.error === "TOKEN_INVALID") {
        return { error: "This link is no longer valid. Please request a new one from the company." };
      }
      if (result.error === "CHANGE_ORDER_NOT_SENT") {
        return { error: "This Change Order is no longer awaiting review." };
      }
      return { error: "An unexpected error occurred. Please try again later." };
    }

    revalidatePath("/workstation");
    auditPublicTokenEvent("change_order.request_changes", {
      changeOrderId: result.changeOrderId,
      organizationId: result.organizationId,
      ip,
    });
    return { success: true };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "TOKEN_INVALID") {
        return { error: "This link is no longer valid. Please request a new one from the company." };
      }
      if (e.message === "CHANGE_ORDER_NOT_SENT") {
        return { error: "This Change Order is no longer awaiting review." };
      }
    }
    return { error: "An unexpected error occurred. Please try again later." };
  }
}

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
              jobId: true,
              baseJobPlanVersion: true,
              executionDeltaJson: true,
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

      const acceptAllowed = canCustomerAcceptChangeOrder(shareToken.changeOrder.status);
      if (!acceptAllowed.ok) {
        if (acceptAllowed.error === "ALREADY_ACCEPTED") {
          return {
            changeOrderId: shareToken.changeOrder.id,
            organizationId: shareToken.changeOrder.organizationId,
            deltaCents: shareToken.changeOrder.priceDeltaCents,
            alreadyAccepted: true as const,
          };
        }
        throw new Error(acceptAllowed.error);
      }

      const changeOrder = shareToken.changeOrder;
      const organizationId = changeOrder.organizationId;
      const deltaValidation = validateChangeOrderExecutionDelta({
        rawDelta: changeOrder.executionDeltaJson,
        baseJobPlanVersion: changeOrder.baseJobPlanVersion,
        currentJobPlanVersion: changeOrder.job.jobPlanVersion,
        priceDeltaCents: changeOrder.priceDeltaCents,
        scopeItems: changeOrder.job.scopeItems,
        tasks: changeOrder.job.tasks.map((task) => ({
          id: task.id,
          status: task.status,
          hardSignal: task.hardSignal,
          requiresSignals: task.requiresSignals,
          providesSignals: task.providesSignals,
          jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
        })),
      });
      if (!deltaValidation.ok) {
        throw new Error("CHANGE_ORDER_DELTA_INVALID");
      }

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
          applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
          acceptedAt: new Date(),
          approvedAt: new Date(),
        },
      });
      await tx.executionPlanRevision.updateMany({
        where: {
          organizationId,
          changeOrderId: changeOrder.id,
          kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
          status: ExecutionPlanRevisionStatus.DRAFT,
        },
        data: { status: ExecutionPlanRevisionStatus.ACCEPTED },
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
      await recordJobActivity(
        {
          organizationId,
          jobId: changeOrder.jobId,
          type: JobActivityType.CHANGE_ORDER_ACCEPTED,
          title: "Change Order accepted",
          entityType: "ChangeOrder",
          entityId: changeOrder.id,
          metadataJson: {
            changeOrderId: changeOrder.id,
            source: "customer_portal",
            acceptedByName: acceptedByName.trim(),
          },
        },
        tx,
      );

      return {
        changeOrderId: changeOrder.id,
        organizationId: changeOrder.organizationId,
        deltaCents: changeOrder.priceDeltaCents,
        alreadyAccepted: false as const,
      };
    });

    revalidatePath(`/jobs`);
    revalidatePath("/workstation");

    if (!result.alreadyAccepted) {
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
    }

    return { success: true };
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "TOKEN_INVALID") {
        return { error: "This link is no longer valid. Please request a new one from the company." };
      }
      if (e.message === "CHANGE_ORDER_NOT_SENT") {
        return { error: "This Change Order is no longer awaiting acceptance." };
      }
      if (e.message === "CHANGE_ORDER_DELTA_INVALID") {
        return { error: "This Change Order needs office review before it can be accepted." };
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
