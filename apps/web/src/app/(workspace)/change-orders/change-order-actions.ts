"use server";

import { revalidatePath } from "next/cache";
import { requireCommercialSession } from "@/lib/session";
import { sendChangeOrder } from "@/lib/change-order/send";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { JobActivityType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  applyChangeOrderWithActor,
  confirmChangeOrderNoCustomerImpactWithActor,
  createChangeOrderDraftWithActor,
  markChangeOrderAcceptedWithActor,
  rejectChangeOrderWithActor,
  updateChangeOrderDraftWithActor,
  validateChangeOrderSendReadinessForStored,
  voidChangeOrderWithActor,
  type CreateChangeOrderDraftInput,
  type UpdateChangeOrderDraftInput,
} from "@/lib/change-order/change-order-lifecycle";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";

type ChangeOrderActionResult = { ok: true; changeOrderId: string } | { ok: false; error: string };

type ChangeOrderApplyResult =
  | {
      ok: true;
      changeOrderId: string;
      executionPlanRevisionId: string;
      resultingJobPlanVersion: number;
    }
  | { ok: false; error: string };

function revalidateChangeOrderSurfaces(quoteId: string, jobId: string) {
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath(`/quotes/${quoteId}/execution-review`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/change-orders`);
  revalidatePath("/workstation");
  revalidatePath("/workstation/tasks");
}

function toActor(session: Awaited<ReturnType<typeof requireCommercialSession>>) {
  return {
    userId: session.userId,
    organizationId: session.organizationId,
    role: session.role,
  };
}

export async function createChangeOrderDraftAction(
  input: CreateChangeOrderDraftInput,
): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const created = await createChangeOrderDraftWithActor(toActor(session), input);
  if (!created.ok) return created;
  revalidateChangeOrderSurfaces(input.quoteId, input.jobId);
  return created;
}

export async function updateChangeOrderDraftAction(
  input: UpdateChangeOrderDraftInput,
): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const row = await db.changeOrder.findFirst({
    where: { id: input.changeOrderId, organizationId: session.organizationId },
    select: { quoteId: true, jobId: true },
  });
  if (!row) return { ok: false, error: "Change Order not found." };

  const updated = await updateChangeOrderDraftWithActor(toActor(session), input);
  if (!updated.ok) return updated;
  revalidateChangeOrderSurfaces(row.quoteId, row.jobId);
  return { ok: true, changeOrderId: updated.changeOrderId };
}

export async function sendChangeOrderAction(
  changeOrderId: string,
  options?: {
    expiresInDays?: number | null;
    recipients?: { email: string; name?: string }[];
    customMessage?: string;
  },
): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const sendReady = await validateChangeOrderSendReadinessForStored(
    id,
    session.organizationId,
    session.role,
  );
  if (!sendReady.ok) return { ok: false, error: sendReady.error };

  const sent = await sendChangeOrder(id, options);
  if (!sent.ok) {
    return { ok: false, error: sent.error ?? "Failed to send Change Order." };
  }
  const row = await db.changeOrder.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { jobId: true, quoteId: true },
  });
  if (row) {
    await recordJobActivity({
      organizationId: session.organizationId,
      jobId: row.jobId,
      type: JobActivityType.CHANGE_ORDER_SENT,
      title: "Change Order sent",
      entityType: "ChangeOrder",
      entityId: id,
      actorUserId: session.userId,
      metadataJson: { changeOrderId: id },
    });
    revalidateChangeOrderSurfaces(row.quoteId, row.jobId);
  }
  return { ok: true, changeOrderId: id };
}

export async function markChangeOrderAcceptedAction(
  changeOrderId: string,
): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const updated = await markChangeOrderAcceptedWithActor(toActor(session), changeOrderId);
  if (!updated.ok) return updated;
  if (updated.quoteId && updated.jobId) {
    revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  }
  return { ok: true, changeOrderId: updated.changeOrderId };
}

export async function confirmChangeOrderNoCustomerImpactAction(
  changeOrderId: string,
): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const updated = await confirmChangeOrderNoCustomerImpactWithActor(
    toActor(session),
    changeOrderId,
  );
  if (!updated.ok) return updated;
  revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  return { ok: true, changeOrderId: updated.changeOrderId };
}

export async function rejectChangeOrderAction(changeOrderId: string): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const updated = await rejectChangeOrderWithActor(toActor(session), changeOrderId);
  if (!updated.ok) return updated;
  if (updated.quoteId && updated.jobId) {
    revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  }
  return { ok: true, changeOrderId: updated.changeOrderId };
}

export async function voidChangeOrderAction(changeOrderId: string): Promise<ChangeOrderActionResult> {
  const session = await requireCommercialSession();
  const updated = await voidChangeOrderWithActor(toActor(session), changeOrderId);
  if (!updated.ok) return updated;
  if (updated.quoteId && updated.jobId) {
    revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  }
  return { ok: true, changeOrderId: updated.changeOrderId };
}

export async function applyChangeOrderAction(
  changeOrderId: string,
  options?: {
    expectedJobPlanVersion?: number | null;
  },
): Promise<ChangeOrderApplyResult> {
  const session = await requireCommercialSession();
  const applied = await applyChangeOrderWithActor(toActor(session), changeOrderId, options);
  if (!applied.ok) return applied;
  revalidateChangeOrderSurfaces(applied.quoteId, applied.jobId);
  return {
    ok: true,
    changeOrderId: applied.changeOrderId,
    executionPlanRevisionId: applied.executionPlanRevisionId,
    resultingJobPlanVersion: applied.resultingJobPlanVersion,
  };
}
