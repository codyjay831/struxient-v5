"use server";

import {
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  ExecutionPlanRevisionKind,
  ExecutionPlanRevisionStatus,
  JobActivityType,
  JobScopeItemStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentSession } from "@/lib/session";
import { recordJobActivity } from "@/lib/job-activity-helper";
import { validateScopeRevisionApplyGuards } from "@/lib/quote-scope-revision-apply-guards";
import { assertExecutionPlanPermission } from "@/lib/execution-plan-permissions";
import {
  createScopeItemDeltaInTx,
  relinkFutureTaskScopesForSupersessionInTx,
  removeScopeItemAndApplyFutureTaskDispositionInTx,
} from "@/lib/execution-delta-service";
import { sendChangeOrder } from "@/lib/change-order/send";

export type ChangeOrderLineInput = {
  operation: ChangeOrderLineOperation;
  sourceJobScopeItemId?: string | null;
  description: string;
  quantity: string;
  unitPriceCents?: number | null;
  priceDeltaCents?: number | null;
  executionRelevant?: boolean;
  scopeDataJson?: unknown;
};

export type CreateChangeOrderDraftInput = {
  quoteId: string;
  jobId: string;
  reasoning: string;
  title?: string;
  customerDocumentTitle?: string | null;
  priceDeltaCents?: number;
  lines: ChangeOrderLineInput[];
};

type ChangeOrderActionResult = | { ok: true; changeOrderId: string } | { ok: false; error: string };

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

function formatChangeOrderNumber(number: number): string {
  return `CO-${String(number).padStart(3, "0")}`;
}

export async function createChangeOrderDraftAction(
  input: CreateChangeOrderDraftInput,
): Promise<ChangeOrderActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  if (!input.reasoning.trim()) {
    return { ok: false, error: "Reasoning is required." };
  }
  if (input.lines.length === 0) {
    return { ok: false, error: "At least one Change Order line is required." };
  }

  const created = await db.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: {
        id: input.quoteId,
        organizationId: session.organizationId,
        job: { is: { id: input.jobId } },
      },
      select: { id: true, job: { select: { id: true } } },
    });
    if (!quote?.job?.id) {
      return { ok: false as const, error: "Quote/job pair not found for Change Order." };
    }

    const maxNumber = await tx.changeOrder.aggregate({
      where: {
        organizationId: session.organizationId,
        jobId: quote.job.id,
      },
      _max: { number: true },
    });
    const nextNumber = (maxNumber._max.number ?? 0) + 1;
    const numberLabel = formatChangeOrderNumber(nextNumber);
    const defaultTitle = `Change Order ${numberLabel}`;

    const changeOrder = await tx.changeOrder.create({
      data: {
        organizationId: session.organizationId,
        quoteId: quote.id,
        jobId: quote.job.id,
        number: nextNumber,
        title: input.title?.trim() || defaultTitle,
        customerDocumentTitle: input.customerDocumentTitle ?? null,
        status: ChangeOrderStatus.DRAFT,
        reasoning: input.reasoning.trim(),
        priceDeltaCents: input.priceDeltaCents ?? 0,
        lines: {
          createMany: {
            data: input.lines.map((line) => ({
              organizationId: session.organizationId,
              operation: line.operation,
              sourceJobScopeItemId: line.sourceJobScopeItemId ?? null,
              description: line.description,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents ?? null,
              priceDeltaCents: line.priceDeltaCents ?? null,
              executionRelevant: line.executionRelevant ?? true,
              scopeDataJson:
                line.scopeDataJson == null
                  ? Prisma.JsonNull
                  : (line.scopeDataJson as Prisma.InputJsonValue),
            })),
          },
        },
      },
      select: { id: true },
    });
    return { ok: true as const, changeOrderId: changeOrder.id };
  });

  if (!created.ok) return created;
  revalidateChangeOrderSurfaces(input.quoteId, input.jobId);
  return created;
}

export async function sendChangeOrderAction(
  changeOrderId: string,
  options?: {
    expiresInDays?: number | null;
    recipients?: { email: string; name?: string }[];
    customMessage?: string;
  },
): Promise<ChangeOrderActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const sent = await sendChangeOrder(id, options);
  if (!sent.ok) {
    return { ok: false, error: sent.error ?? "Failed to send Change Order." };
  }
  return { ok: true, changeOrderId: id };
}

export async function markChangeOrderAcceptedAction(
  changeOrderId: string,
): Promise<ChangeOrderActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id, organizationId: session.organizationId },
      select: { id: true, quoteId: true, jobId: true, status: true },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };
    if (row.status === ChangeOrderStatus.APPLIED) {
      return { ok: false as const, error: "Applied Change Orders cannot be accepted again." };
    }

    await tx.changeOrder.update({
      where: { id },
      data: {
        status: ChangeOrderStatus.ACCEPTED,
        approvedByUserId: session.userId,
        approvedAt: new Date(),
        acceptedAt: new Date(),
      },
    });
    return { ok: true as const, quoteId: row.quoteId, jobId: row.jobId };
  });
  if (!updated.ok) return updated;
  revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  return { ok: true, changeOrderId: id };
}

export async function rejectChangeOrderAction(changeOrderId: string): Promise<ChangeOrderActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id, organizationId: session.organizationId },
      select: { id: true, quoteId: true, jobId: true, status: true },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };
    if (row.status === ChangeOrderStatus.APPLIED) {
      return { ok: false as const, error: "Applied Change Orders cannot be rejected." };
    }

    await tx.changeOrder.update({
      where: { id },
      data: { status: ChangeOrderStatus.REJECTED },
    });
    return { ok: true as const, quoteId: row.quoteId, jobId: row.jobId };
  });
  if (!updated.ok) return updated;
  revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  return { ok: true, changeOrderId: id };
}

export async function voidChangeOrderAction(changeOrderId: string): Promise<ChangeOrderActionResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "approve_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.changeOrder.findFirst({
      where: { id, organizationId: session.organizationId },
      select: { id: true, quoteId: true, jobId: true, status: true },
    });
    if (!row) return { ok: false as const, error: "Change Order not found." };
    if (row.status === ChangeOrderStatus.APPLIED) {
      return { ok: false as const, error: "Applied Change Orders cannot be voided." };
    }

    await tx.changeOrder.update({
      where: { id },
      data: { status: ChangeOrderStatus.VOID },
    });
    return { ok: true as const, quoteId: row.quoteId, jobId: row.jobId };
  });
  if (!updated.ok) return updated;
  revalidateChangeOrderSurfaces(updated.quoteId, updated.jobId);
  return { ok: true, changeOrderId: id };
}

export async function applyChangeOrderAction(
  changeOrderId: string,
  options?: {
    expectedJobPlanVersion?: number | null;
  },
): Promise<ChangeOrderApplyResult> {
  const session = await requireCurrentSession();
  const permission = assertExecutionPlanPermission(session.role, "apply_scope_revision");
  if (!permission.ok) return { ok: false, error: permission.error };

  const id = changeOrderId.trim();
  if (!id) return { ok: false, error: "Missing Change Order id." };

  const applied = await db.$transaction(async (tx) => {
    const changeOrder = await tx.changeOrder.findFirst({
      where: {
        id,
        organizationId: session.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        quoteId: true,
        jobId: true,
        status: true,
        number: true,
        priceDeltaCents: true,
        reasoning: true,
        lines: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            operation: true,
            sourceJobScopeItemId: true,
            description: true,
            quantity: true,
            unitPriceCents: true,
            priceDeltaCents: true,
            executionRelevant: true,
          },
        },
      },
    });
    if (!changeOrder) {
      return { ok: false as const, error: "Change Order was not found." };
    }

    const requiresCustomerAcceptance = changeOrder.priceDeltaCents !== 0;
    if (requiresCustomerAcceptance && changeOrder.status !== ChangeOrderStatus.ACCEPTED) {
      return { ok: false as const, error: "Price-impact Change Orders must be accepted before apply." };
    }
    if (
      !requiresCustomerAcceptance &&
      changeOrder.status !== ChangeOrderStatus.DRAFT &&
      changeOrder.status !== ChangeOrderStatus.ACCEPTED
    ) {
      return { ok: false as const, error: "Only draft or accepted Change Orders can be applied." };
    }

    const job = await tx.job.findFirst({
      where: {
        id: changeOrder.jobId,
        organizationId: session.organizationId,
      },
      select: { id: true, jobPlanVersion: true },
    });
    if (!job) {
      return { ok: false as const, error: "Change Order job was not found." };
    }
    if (
      options?.expectedJobPlanVersion != null &&
      options.expectedJobPlanVersion !== job.jobPlanVersion
    ) {
      return {
        ok: false as const,
        error: "Job plan changed. Refresh and retry with the latest Change Order state.",
      };
    }

    for (const line of changeOrder.lines) {
      if (line.operation !== ChangeOrderLineOperation.ADD && !line.sourceJobScopeItemId) {
        return {
          ok: false as const,
          error: "MODIFY/REMOVE lines require a source job scope item.",
        };
      }
    }

    for (const line of changeOrder.lines) {
      if (line.operation === ChangeOrderLineOperation.ADD) {
        await createScopeItemDeltaInTx(tx, {
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
          sourceChangeOrderLineId: line.id,
          description: line.description,
          quantity: line.quantity.toString(),
          unitPriceCents: line.unitPriceCents,
          executionRelevant: line.executionRelevant,
        });
        continue;
      }

      const sourceItem = await tx.jobScopeItem.findFirst({
        where: {
          id: line.sourceJobScopeItemId!,
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
        },
        select: { id: true, status: true },
      });
      if (!sourceItem || sourceItem.status !== JobScopeItemStatus.ACTIVE) {
        return {
          ok: false as const,
          error: "Source scope item must exist and be active for MODIFY/REMOVE operations.",
        };
      }

      if (line.operation === ChangeOrderLineOperation.MODIFY) {
        const replacement = await createScopeItemDeltaInTx(tx, {
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
          sourceChangeOrderLineId: line.id,
          description: line.description,
          quantity: line.quantity.toString(),
          unitPriceCents: line.unitPriceCents,
          executionRelevant: line.executionRelevant,
        });

        await tx.jobScopeItem.update({
          where: { id: sourceItem.id },
          data: {
            status: JobScopeItemStatus.SUPERSEDED,
            supersededByJobScopeItemId: replacement.id,
          },
        });

        await relinkFutureTaskScopesForSupersessionInTx(tx, {
          organizationId: changeOrder.organizationId,
          sourceScopeItemId: sourceItem.id,
          replacementScopeItemId: replacement.id,
        });
        continue;
      }

      await removeScopeItemAndApplyFutureTaskDispositionInTx(tx, {
        organizationId: changeOrder.organizationId,
        jobId: changeOrder.jobId,
        sourceScopeItemId: sourceItem.id,
        actorUserId: session.userId,
        canceledReason: "Scope removed by applied Change Order",
        metadataJson: {
          sourceChangeOrderId: changeOrder.id,
          scopeItemId: sourceItem.id,
        },
      });
    }

    let hasApprovedPaymentImpactOperationInTx = false;
    if (changeOrder.priceDeltaCents !== 0) {
      const numberLabel = formatChangeOrderNumber(changeOrder.number);
      await tx.jobPaymentRequirement.create({
        data: {
          organizationId: changeOrder.organizationId,
          jobId: changeOrder.jobId,
          title: `Change Order ${numberLabel}`,
          amountCents: changeOrder.priceDeltaCents,
          sourceChangeOrderId: changeOrder.id,
          status: "PENDING",
        },
      });
      hasApprovedPaymentImpactOperationInTx = true;
    }

    const postScopeItems = await tx.jobScopeItem.findMany({
      where: { jobId: changeOrder.jobId },
      select: {
        id: true,
        executionRelevant: true,
        status: true,
      },
    });
    const postTasks = await tx.jobTask.findMany({
      where: { jobId: changeOrder.jobId },
      select: {
        id: true,
        status: true,
        hardSignal: true,
        requiresSignals: true,
        providesSignals: true,
        scopes: { select: { jobScopeItemId: true } },
      },
    });
    const guards = validateScopeRevisionApplyGuards({
      priceDeltaCents: changeOrder.priceDeltaCents,
      hasApprovedPaymentImpactOperationInTx,
      scopeItems: postScopeItems.map((item) => ({
        id: item.id,
        executionRelevant: item.executionRelevant,
        status: item.status,
      })),
      tasks: postTasks.map((task) => ({
        id: task.id,
        status: task.status,
        hardSignal: task.hardSignal,
        requiresSignals: task.requiresSignals,
        providesSignals: task.providesSignals,
        jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
      })),
    });
    if (!guards.ok) {
      return { ok: false as const, error: guards.errors.join(" ") };
    }

    const resultingJobPlanVersion = job.jobPlanVersion + 1;
    await tx.job.update({
      where: { id: changeOrder.jobId },
      data: {
        jobPlanVersion: resultingJobPlanVersion,
      },
    });
    await tx.changeOrder.update({
      where: { id: changeOrder.id },
      data: {
        status: ChangeOrderStatus.APPLIED,
        appliedAt: new Date(),
      },
    });
    const executionPlanRevision = await tx.executionPlanRevision.create({
      data: {
        organizationId: changeOrder.organizationId,
        quoteId: changeOrder.quoteId,
        jobId: changeOrder.jobId,
        changeOrderId: changeOrder.id,
        kind: ExecutionPlanRevisionKind.SCOPE_RECONCILIATION,
        status: ExecutionPlanRevisionStatus.APPLIED,
        basePlanVersion: job.jobPlanVersion,
        resultingPlanVersion: resultingJobPlanVersion,
        proposalJson: {
          changeOrderId: changeOrder.id,
          lines: changeOrder.lines.map((line) => ({
            id: line.id,
            operation: line.operation,
            sourceJobScopeItemId: line.sourceJobScopeItemId,
            description: line.description,
          })),
        },
        proposalSchemaVersion: 1,
        plannerVersion: "change-order-v1",
        modelProviderMeta: {
          source: "applyChangeOrderAction",
          paymentImpactOperationInTx: hasApprovedPaymentImpactOperationInTx,
        },
        planningInputHash: null,
        reasoningSummary: changeOrder.reasoning,
        approvedByUserId: session.userId,
        appliedAt: new Date(),
      },
      select: { id: true },
    });
    await recordJobActivity(
      {
        organizationId: changeOrder.organizationId,
        jobId: changeOrder.jobId,
        type: JobActivityType.SCOPE_REVISION_APPLIED,
        title: "Change Order applied",
        details: changeOrder.reasoning,
        entityType: "ChangeOrder",
        entityId: changeOrder.id,
        actorUserId: session.userId,
        metadataJson: {
          changeOrderId: changeOrder.id,
          resultingJobPlanVersion,
          executionPlanRevisionId: executionPlanRevision.id,
          lineCount: changeOrder.lines.length,
        },
      },
      tx,
    );
    return {
      ok: true as const,
      changeOrderId: changeOrder.id,
      executionPlanRevisionId: executionPlanRevision.id,
      resultingJobPlanVersion,
      quoteId: changeOrder.quoteId,
      jobId: changeOrder.jobId,
    };
  });

  if (!applied.ok) return applied;
  revalidateChangeOrderSurfaces(applied.quoteId, applied.jobId);
  return {
    ok: true,
    changeOrderId: applied.changeOrderId,
    executionPlanRevisionId: applied.executionPlanRevisionId,
    resultingJobPlanVersion: applied.resultingJobPlanVersion,
  };
}
