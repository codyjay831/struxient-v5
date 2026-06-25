import {
  JobTaskStatus,
  LineItemTemplateTaskSource,
  Prisma,
  TaskTemplateCategory,
} from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import {
  createScopeItemDeltaInTx,
  relinkFutureTaskScopesForSupersessionInTx,
  removeScopeItemAndApplyFutureTaskDispositionInTx,
  cancelTaskAsExecutionDeltaInTx,
} from "@/lib/execution-delta-service";
import type {
  ChangeOrderExecutionDeltaOperation,
  ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import { executionDeltaHasUnreviewedGeneratedTasks } from "@/lib/change-order/change-order-execution-task-composer";

export type ApplyChangeOrderExecutionDeltaResult = {
  hasPaymentOperation: boolean;
  appliedOperationIds: string[];
};

function getPayloadString(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
): string | null {
  const value = operation.payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getPayloadStringArray(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
): string[] {
  const value = operation.payload?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getPayloadNumber(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
): number | null {
  const value = operation.payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getPayloadBoolean(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
): boolean | null {
  const value = operation.payload?.[key];
  return typeof value === "boolean" ? value : null;
}

function getJsonPayload(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
): Prisma.InputJsonValue | undefined {
  const value = operation.payload?.[key];
  if (value == null) return undefined;
  return value as Prisma.InputJsonValue;
}

function resolveCategory(value: unknown): TaskTemplateCategory {
  if (typeof value === "string" && value in TaskTemplateCategory) {
    return value as TaskTemplateCategory;
  }
  return TaskTemplateCategory.GENERAL;
}

async function resolveStageId(
  tx: ExtendedTransactionClient,
  params: {
    jobId: string;
    requestedJobStageId: string | null;
  },
): Promise<string> {
  if (params.requestedJobStageId) {
    const stage = await tx.jobStage.findFirst({
      where: { id: params.requestedJobStageId, jobId: params.jobId },
      select: { id: true },
    });
    if (stage) return stage.id;
  }

  const firstStage = await tx.jobStage.findFirst({
    where: { jobId: params.jobId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!firstStage) {
    throw new Error("CHANGE_ORDER_DELTA_NO_JOB_STAGE");
  }
  return firstStage.id;
}

async function nextSortOrder(
  tx: ExtendedTransactionClient,
  jobStageId: string,
): Promise<number> {
  const maxSort = await tx.jobTask.aggregate({
    where: { jobStageId },
    _max: { sortOrder: true },
  });
  return (maxSort._max.sortOrder ?? 0) + 1;
}

export async function applyChangeOrderExecutionDeltaInTx(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    jobId: string;
    changeOrderId: string;
    actorUserId: string;
    proposal: ChangeOrderExecutionDeltaProposal;
  },
): Promise<ApplyChangeOrderExecutionDeltaResult> {
  if (executionDeltaHasUnreviewedGeneratedTasks(params.proposal)) {
    throw new Error("CHANGE_ORDER_UNREVIEWED_GENERATED_TASKS");
  }

  const scopeResultByOpId = new Map<string, string>();
  const appliedOperationIds: string[] = [];
  let hasPaymentOperation = false;

  for (const operation of params.proposal.operations) {
    switch (operation.type) {
      case "ADD_SCOPE_ITEM": {
        const created = await createScopeItemDeltaInTx(tx, {
          organizationId: params.organizationId,
          jobId: params.jobId,
          sourceChangeOrderLineId: getPayloadString(operation, "changeOrderLineId") ?? "",
          description: getPayloadString(operation, "description") ?? "Untitled Change Order scope",
          quantity: getPayloadString(operation, "quantity") ?? "1",
          unitPriceCents: getPayloadNumber(operation, "unitPriceCents"),
          executionRelevant: getPayloadBoolean(operation, "executionRelevant") ?? true,
        });
        scopeResultByOpId.set(operation.opId, created.id);
        break;
      }
      case "MODIFY_SCOPE_ITEM": {
        if (!operation.targetEntityId) throw new Error(`${operation.opId}: missing target scope`);
        const replacement = await createScopeItemDeltaInTx(tx, {
          organizationId: params.organizationId,
          jobId: params.jobId,
          sourceChangeOrderLineId: getPayloadString(operation, "changeOrderLineId") ?? "",
          description: getPayloadString(operation, "description") ?? "Updated Change Order scope",
          quantity: getPayloadString(operation, "quantity") ?? "1",
          unitPriceCents: getPayloadNumber(operation, "unitPriceCents"),
          executionRelevant: getPayloadBoolean(operation, "executionRelevant") ?? true,
        });
        await tx.jobScopeItem.update({
          where: { id: operation.targetEntityId },
          data: {
            status: "SUPERSEDED",
            supersededByJobScopeItemId: replacement.id,
          },
        });
        await relinkFutureTaskScopesForSupersessionInTx(tx, {
          organizationId: params.organizationId,
          sourceScopeItemId: operation.targetEntityId,
          replacementScopeItemId: replacement.id,
        });
        scopeResultByOpId.set(operation.opId, replacement.id);
        break;
      }
      case "REMOVE_SCOPE_ITEM": {
        if (!operation.targetEntityId) throw new Error(`${operation.opId}: missing target scope`);
        await removeScopeItemAndApplyFutureTaskDispositionInTx(tx, {
          organizationId: params.organizationId,
          jobId: params.jobId,
          sourceScopeItemId: operation.targetEntityId,
          actorUserId: params.actorUserId,
          canceledReason: operation.reason,
          metadataJson: {
            sourceChangeOrderId: params.changeOrderId,
            executionDeltaOpId: operation.opId,
          },
        });
        break;
      }
      case "ADD_TASK": {
        const jobStageId = await resolveStageId(tx, {
          jobId: params.jobId,
          requestedJobStageId: getPayloadString(operation, "jobStageId"),
        });
        const scopeIds = [
          ...getPayloadStringArray(operation, "jobScopeItemIds"),
          ...getPayloadStringArray(operation, "scopeOpIds")
            .map((opId) => scopeResultByOpId.get(opId))
            .filter((id): id is string => Boolean(id)),
        ];
        const created = await tx.jobTask.create({
          data: {
            jobId: params.jobId,
            jobStageId,
            sourceType: LineItemTemplateTaskSource.CUSTOM,
            sourceChangeOrderId: params.changeOrderId,
            sourceExecutionDeltaOpId: operation.opId,
            title: getPayloadString(operation, "title") ?? "Change Order task",
            instructions: getPayloadString(operation, "instructions"),
            category: resolveCategory(operation.payload?.category),
            status: JobTaskStatus.TODO,
            sortOrder: await nextSortOrder(tx, jobStageId),
            completionRequirementsJson:
              getJsonPayload(operation, "completionRequirementsJson") ?? {},
            partsRequiredJson: getJsonPayload(operation, "partsRequiredJson"),
            providesSignals: getPayloadStringArray(operation, "providesSignals"),
            requiresSignals: getPayloadStringArray(operation, "requiresSignals"),
            hardSignal: getPayloadBoolean(operation, "hardSignal") ?? false,
          },
          select: { id: true },
        });
        if (scopeIds.length > 0) {
          await tx.jobTaskScope.createMany({
            data: scopeIds.map((jobScopeItemId) => ({
              organizationId: params.organizationId,
              jobTaskId: created.id,
              jobScopeItemId,
            })),
            skipDuplicates: true,
          });
        }
        break;
      }
      case "CANCEL_TASK": {
        if (!operation.targetEntityId) throw new Error(`${operation.opId}: missing target task`);
        const task = await tx.jobTask.findFirst({
          where: { id: operation.targetEntityId, jobId: params.jobId },
          select: { id: true, title: true, status: true },
        });
        if (!task) throw new Error(`${operation.opId}: target task not found`);
        if (task.status === JobTaskStatus.DONE) {
          throw new Error(`${operation.opId}: completed tasks cannot be canceled by Change Order delta.`);
        }
        if (task.status === JobTaskStatus.CANCELED) {
          break;
        }
        await cancelTaskAsExecutionDeltaInTx(tx, {
          organizationId: params.organizationId,
          jobId: params.jobId,
          taskId: task.id,
          taskTitle: task.title,
          actorUserId: params.actorUserId,
          reason: operation.reason,
          metadataJson: {
            sourceChangeOrderId: params.changeOrderId,
            executionDeltaOpId: operation.opId,
          },
        });
        break;
      }
      case "MODIFY_TASK": {
        if (!operation.targetEntityId) throw new Error(`${operation.opId}: missing target task`);
        const data: Record<string, unknown> = {};
        const title = getPayloadString(operation, "title");
        const instructions = getPayloadString(operation, "instructions");
        if (title) data.title = title;
        if (instructions != null) data.instructions = instructions;
        const requiresSignals = getPayloadStringArray(operation, "requiresSignals");
        const providesSignals = getPayloadStringArray(operation, "providesSignals");
        if (requiresSignals.length > 0) data.requiresSignals = requiresSignals;
        if (providesSignals.length > 0) data.providesSignals = providesSignals;
        const hardSignal = getPayloadBoolean(operation, "hardSignal");
        if (hardSignal != null) data.hardSignal = hardSignal;
        if (Object.keys(data).length > 0) {
          await tx.jobTask.update({
            where: { id: operation.targetEntityId },
            data,
          });
        }
        const scopeIds = getPayloadStringArray(operation, "jobScopeItemIds");
        if (scopeIds.length > 0) {
          await tx.jobTaskScope.deleteMany({
            where: {
              organizationId: params.organizationId,
              jobTaskId: operation.targetEntityId,
            },
          });
          await tx.jobTaskScope.createMany({
            data: scopeIds.map((jobScopeItemId) => ({
              organizationId: params.organizationId,
              jobTaskId: operation.targetEntityId!,
              jobScopeItemId,
            })),
            skipDuplicates: true,
          });
        }
        break;
      }
      case "UPDATE_PAYMENT_REQUIREMENT": {
        hasPaymentOperation = true;
        await tx.jobPaymentRequirement.create({
          data: {
            organizationId: params.organizationId,
            jobId: params.jobId,
            title: getPayloadString(operation, "title") ?? "Change Order",
            amountCents: getPayloadNumber(operation, "amountCents") ?? 0,
            sourceChangeOrderId: params.changeOrderId,
            status: "PENDING",
          },
        });
        break;
      }
    }
    appliedOperationIds.push(operation.opId);
  }

  return { hasPaymentOperation, appliedOperationIds };
}
