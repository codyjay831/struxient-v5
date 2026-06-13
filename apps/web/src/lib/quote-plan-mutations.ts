import "server-only";

import { Prisma, QuoteExecutionPlanStatus } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import { ensureQuoteExecutionPlanInTx } from "@/lib/quote-line-item-template-apply-tx";

export type QuoteExecutionTaskMutationInput = {
  title: string;
  category: string;
  stageId: string | null;
  instructions: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  requirementsJson: Prisma.InputJsonValue;
  partsRequiredJson: Prisma.InputJsonValue;
  sourceType: "TASK_TEMPLATE" | "CUSTOM";
  sourceTaskTemplateId: string | null;
  sourceLineItemTemplateTaskId: string | null;
  sourceQuoteLineExecutionTaskId: string | null;
  origin?: "AI_PLAN" | "TEMPLATE_COPY" | "MANUAL" | "SCOPE_REVISION" | "ISSUE_RECOVERY";
  planningTags?: string[];
  relatedLineItemIds: string[];
  protectedAt?: Date | null;
  humanEditedAt?: Date | null;
};

type EnsureEditableQuoteParams = {
  quoteId: string;
  organizationId: string;
};

export async function assertQuoteExecutionEditableInTx(
  tx: ExtendedTransactionClient,
  params: EnsureEditableQuoteParams,
) {
  const quote = await tx.quote.findFirst({
    where: {
      id: params.quoteId,
      organizationId: params.organizationId,
      status: { in: ["DRAFT", "SENT", "APPROVED"] },
      job: { is: null },
    },
    select: { id: true, status: true },
  });
  if (!quote) return null;
  return quote;
}

async function nextQuoteExecutionTaskSortOrder(
  tx: ExtendedTransactionClient,
  quoteExecutionPlanId: string,
) {
  const agg = await tx.quoteExecutionTask.aggregate({
    where: { quoteExecutionPlanId },
    _max: { sortOrder: true },
  });
  return (agg._max.sortOrder ?? -1) + 1;
}

async function markQuotePlanNeedsReviewInTx(
  tx: ExtendedTransactionClient,
  planId: string,
  currentStatus: QuoteExecutionPlanStatus,
) {
  const needsReview = currentStatus === QuoteExecutionPlanStatus.ACCEPTED;
  await tx.quoteExecutionPlan.update({
    where: { id: planId },
    data: {
      planVersion: { increment: 1 },
      status: needsReview ? QuoteExecutionPlanStatus.READY_FOR_REVIEW : currentStatus,
    },
  });
}

async function assertQuoteLineScopesBelongToQuote(
  tx: ExtendedTransactionClient,
  params: { quoteId: string; organizationId: string; quoteLineItemIds: string[] },
) {
  const rows = await tx.quoteLineItem.findMany({
    where: {
      id: { in: params.quoteLineItemIds },
      quoteId: params.quoteId,
      quote: { organizationId: params.organizationId },
    },
    select: { id: true },
  });
  return rows.length === params.quoteLineItemIds.length;
}

export async function createQuoteExecutionTaskInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    input: QuoteExecutionTaskMutationInput;
  },
) {
  const editable = await assertQuoteExecutionEditableInTx(tx, {
    quoteId: params.quoteId,
    organizationId: params.organizationId,
  });
  if (!editable) {
    return { ok: false as const, error: "QUOTE_NOT_EDITABLE" as const };
  }
  const relatedLineItemIds = [...new Set(params.input.relatedLineItemIds.map((id) => id.trim()).filter(Boolean))];
  if (relatedLineItemIds.length === 0) {
    return { ok: false as const, error: "TASK_SCOPE_REQUIRED" as const };
  }
  const validScopes = await assertQuoteLineScopesBelongToQuote(tx, {
    quoteId: params.quoteId,
    organizationId: params.organizationId,
    quoteLineItemIds: relatedLineItemIds,
  });
  if (!validScopes) {
    return { ok: false as const, error: "INVALID_TASK_SCOPE" as const };
  }

  const plan = await ensureQuoteExecutionPlanInTx(tx, {
    quoteId: params.quoteId,
    organizationId: params.organizationId,
  });
  const sortOrder = await nextQuoteExecutionTaskSortOrder(tx, plan.id);
  const task = await tx.quoteExecutionTask.create({
    data: {
      organizationId: params.organizationId,
      quoteExecutionPlanId: plan.id,
      sourceLineItemTemplateTaskId: params.input.sourceLineItemTemplateTaskId,
      sourceQuoteLineExecutionTaskId: params.input.sourceQuoteLineExecutionTaskId,
      sourceTaskTemplateId: params.input.sourceTaskTemplateId,
      sourceType: params.input.sourceType,
      origin: params.input.origin ?? "MANUAL",
      title: params.input.title,
      category: params.input.category as never,
      instructions: params.input.instructions,
      sortOrder,
      requirementsJson: params.input.requirementsJson,
      partsRequiredJson: params.input.partsRequiredJson,
      providesSignals: params.input.providesSignals,
      requiresSignals: params.input.requiresSignals,
      hardSignal: params.input.hardSignal,
      planningTags: params.input.planningTags ?? [],
      stageId: params.input.stageId,
      protectedAt: params.input.protectedAt ?? null,
      humanEditedAt: params.input.humanEditedAt ?? null,
      scopes: {
        create: relatedLineItemIds.map((quoteLineItemId) => ({
          organizationId: params.organizationId,
          quoteLineItemId,
        })),
      },
    },
    select: { id: true, quoteExecutionPlanId: true },
  });

  await markQuotePlanNeedsReviewInTx(tx, plan.id, plan.status);
  await tx.$executeRaw`
    UPDATE "Quote"
    SET "updatedAt" = NOW()
    WHERE "id" = ${params.quoteId} AND "organizationId" = ${params.organizationId}
  `;
  return { ok: true as const, taskId: task.id, planId: task.quoteExecutionPlanId };
}

export async function patchQuoteExecutionTaskSignalsBySourceTaskIdInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    sourceQuoteLineExecutionTaskId: string;
    providesSignals?: string[];
    requiresSignals?: string[];
  },
) {
  const sourceId = params.sourceQuoteLineExecutionTaskId.trim();
  if (!sourceId) return { ok: false as const, error: "SOURCE_TASK_REQUIRED" as const };
  const planTask = await tx.quoteExecutionTask.findFirst({
    where: {
      sourceQuoteLineExecutionTaskId: sourceId,
      quoteExecutionPlan: { quoteId: params.quoteId, organizationId: params.organizationId },
    },
    select: { id: true, quoteExecutionPlanId: true },
  });
  if (!planTask) {
    return { ok: false as const, error: "PLAN_TASK_NOT_FOUND" as const };
  }
  const plan = await tx.quoteExecutionPlan.findUnique({
    where: { id: planTask.quoteExecutionPlanId },
    select: { status: true },
  });
  if (!plan) {
    return { ok: false as const, error: "PLAN_NOT_FOUND" as const };
  }
  await tx.quoteExecutionTask.update({
    where: { id: planTask.id },
    data: {
      providesSignals: params.providesSignals,
      requiresSignals: params.requiresSignals,
      humanEditedAt: new Date(),
    },
  });
  await markQuotePlanNeedsReviewInTx(tx, planTask.quoteExecutionPlanId, plan.status);
  return { ok: true as const };
}

export async function syncQuoteExecutionTaskFromSourceTaskInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    sourceQuoteLineExecutionTaskId: string;
    data: {
      title?: string;
      category?: string;
      stageId?: string | null;
      instructions?: string | null;
      providesSignals?: string[];
      requiresSignals?: string[];
      hardSignal?: boolean;
      requirementsJson?: Prisma.InputJsonValue;
      partsRequiredJson?: Prisma.InputJsonValue;
    };
  },
) {
  const sourceId = params.sourceQuoteLineExecutionTaskId.trim();
  if (!sourceId) return { ok: false as const, error: "SOURCE_TASK_REQUIRED" as const };
  const planTask = await tx.quoteExecutionTask.findFirst({
    where: {
      sourceQuoteLineExecutionTaskId: sourceId,
      quoteExecutionPlan: { quoteId: params.quoteId, organizationId: params.organizationId },
    },
    select: { id: true, quoteExecutionPlanId: true },
  });
  if (!planTask) {
    return { ok: false as const, error: "PLAN_TASK_NOT_FOUND" as const };
  }
  const plan = await tx.quoteExecutionPlan.findUnique({
    where: { id: planTask.quoteExecutionPlanId },
    select: { status: true },
  });
  if (!plan) {
    return { ok: false as const, error: "PLAN_NOT_FOUND" as const };
  }
  await tx.quoteExecutionTask.update({
    where: { id: planTask.id },
    data: {
      title: params.data.title,
      category: params.data.category as never,
      stageId: params.data.stageId,
      instructions: params.data.instructions,
      providesSignals: params.data.providesSignals,
      requiresSignals: params.data.requiresSignals,
      hardSignal: params.data.hardSignal,
      requirementsJson: params.data.requirementsJson,
      partsRequiredJson: params.data.partsRequiredJson,
      humanEditedAt: new Date(),
    },
  });
  await markQuotePlanNeedsReviewInTx(tx, planTask.quoteExecutionPlanId, plan.status);
  return { ok: true as const };
}

export async function reorderQuoteExecutionTasksBySourceTaskIdInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    sortOrderBySourceTaskId: Record<string, number>;
  },
) {
  const sourceTaskIds = Object.keys(params.sortOrderBySourceTaskId)
    .map((id) => id.trim())
    .filter(Boolean);
  if (sourceTaskIds.length === 0) {
    return { ok: false as const, error: "SOURCE_TASK_REQUIRED" as const };
  }
  const plan = await tx.quoteExecutionPlan.findFirst({
    where: {
      quoteId: params.quoteId,
      organizationId: params.organizationId,
    },
    select: { id: true, status: true },
  });
  if (!plan) {
    return { ok: false as const, error: "PLAN_NOT_FOUND" as const };
  }
  const tasks = await tx.quoteExecutionTask.findMany({
    where: {
      quoteExecutionPlanId: plan.id,
      sourceQuoteLineExecutionTaskId: { in: sourceTaskIds },
    },
    select: { id: true, sourceQuoteLineExecutionTaskId: true },
  });
  for (const task of tasks) {
    const sourceId = task.sourceQuoteLineExecutionTaskId;
    if (!sourceId) continue;
    const nextSortOrder = params.sortOrderBySourceTaskId[sourceId];
    if (nextSortOrder == null) continue;
    await tx.quoteExecutionTask.update({
      where: { id: task.id },
      data: { sortOrder: nextSortOrder },
    });
  }
  if (tasks.length > 0) {
    await markQuotePlanNeedsReviewInTx(tx, plan.id, plan.status);
  }
  return { ok: true as const };
}

export async function deleteQuoteExecutionTasksBySourceTaskIdInTx(
  tx: ExtendedTransactionClient,
  params: {
    quoteId: string;
    organizationId: string;
    sourceTaskIds: string[];
  },
) {
  const sourceTaskIds = [...new Set(params.sourceTaskIds.map((id) => id.trim()).filter(Boolean))];
  if (sourceTaskIds.length === 0) return { ok: true as const, deletedCount: 0 };
  const plan = await tx.quoteExecutionPlan.findFirst({
    where: {
      quoteId: params.quoteId,
      organizationId: params.organizationId,
    },
    select: { id: true, status: true },
  });
  if (!plan) {
    return { ok: true as const, deletedCount: 0 };
  }
  const deleted = await tx.quoteExecutionTask.deleteMany({
    where: {
      quoteExecutionPlanId: plan.id,
      sourceQuoteLineExecutionTaskId: { in: sourceTaskIds },
    },
  });
  if (deleted.count > 0) {
    await markQuotePlanNeedsReviewInTx(tx, plan.id, plan.status);
  }
  return { ok: true as const, deletedCount: deleted.count };
}

