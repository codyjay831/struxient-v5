import { ChangeOrderLineOperation } from "@prisma/client";
import { withGeneratedTaskOriginPayload } from "@/lib/change-order/change-order-execution-task-composer";
import {
  CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  type ChangeOrderExecutionDeltaOperation,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";

export type ChangeOrderLineForExecutionDelta = {
  id: string;
  operation: ChangeOrderLineOperation;
  sourceJobScopeItemId: string | null;
  description: string;
  quantity: { toString(): string } | string;
  unitPriceCents: number | null;
  priceDeltaCents: number | null;
  executionRelevant: boolean;
};

function lineQuantityToString(quantity: { toString(): string } | string): string {
  return typeof quantity === "string" ? quantity : quantity.toString();
}

function scopeOpId(lineId: string): string {
  return `scope:${lineId}`;
}

function taskOpId(lineId: string): string {
  return `task:${lineId}`;
}

export function buildDefaultExecutionDeltaFromChangeOrderLines(params: {
  baseJobPlanVersion: number;
  changeOrderId?: string;
  number?: number;
  priceDeltaCents: number;
  reasoning: string;
  lines: ChangeOrderLineForExecutionDelta[];
  skipLegacyPaymentOperation?: boolean;
}): ChangeOrderExecutionDeltaProposal {
  const operations: ChangeOrderExecutionDeltaOperation[] = [];

  for (const line of params.lines) {
    const commonPayload = {
      changeOrderLineId: line.id,
      description: line.description,
      quantity: lineQuantityToString(line.quantity),
      unitPriceCents: line.unitPriceCents,
      executionRelevant: line.executionRelevant,
    };

    if (line.operation === ChangeOrderLineOperation.ADD) {
      operations.push({
        opId: scopeOpId(line.id),
        type: "ADD_SCOPE_ITEM",
        targetEntityType: "JobScopeItem",
        payload: commonPayload,
        linkedChangeOrderLineId: line.id,
        reason: params.reasoning,
        customerLabel: line.description,
        requiresCustomerApproval: line.priceDeltaCents !== 0,
      });

      if (line.executionRelevant) {
        operations.push({
          opId: taskOpId(line.id),
          type: "ADD_TASK",
          targetEntityType: "JobTask",
          payload: withGeneratedTaskOriginPayload(
            {
              title: `Execute change: ${line.description}`,
              instructions: `Work created by Change Order${params.number ? ` CO-${String(params.number).padStart(3, "0")}` : ""}.`,
              scopeOpIds: [scopeOpId(line.id)],
              category: "GENERAL",
            },
            line.id,
          ),
          linkedChangeOrderLineId: line.id,
          reason: `Create execution coverage for added scope: ${line.description}`,
          internalNote: "Generated from the commercial Change Order line.",
          requiresCustomerApproval: line.priceDeltaCents !== 0,
        });
      }
      continue;
    }

    if (!line.sourceJobScopeItemId) {
      operations.push({
        opId: scopeOpId(line.id),
        type:
          line.operation === ChangeOrderLineOperation.MODIFY
            ? "MODIFY_SCOPE_ITEM"
            : "REMOVE_SCOPE_ITEM",
        targetEntityType: "JobScopeItem",
        payload: commonPayload,
        linkedChangeOrderLineId: line.id,
        reason: "Source scope was not selected when this Change Order was drafted.",
        internalNote: "Invalid until office selects a source job scope item.",
      });
      continue;
    }

    if (line.operation === ChangeOrderLineOperation.MODIFY) {
      operations.push({
        opId: scopeOpId(line.id),
        type: "MODIFY_SCOPE_ITEM",
        targetEntityType: "JobScopeItem",
        targetEntityId: line.sourceJobScopeItemId,
        payload: commonPayload,
        linkedChangeOrderLineId: line.id,
        reason: params.reasoning,
        customerLabel: line.description,
        requiresCustomerApproval: line.priceDeltaCents !== 0,
      });
      continue;
    }

    operations.push({
      opId: scopeOpId(line.id),
      type: "REMOVE_SCOPE_ITEM",
      targetEntityType: "JobScopeItem",
      targetEntityId: line.sourceJobScopeItemId,
      payload: { changeOrderLineId: line.id },
      linkedChangeOrderLineId: line.id,
      reason: params.reasoning,
      customerLabel: line.description,
      requiresCustomerApproval: line.priceDeltaCents !== 0,
    });
  }

  if (params.priceDeltaCents !== 0 && !params.skipLegacyPaymentOperation) {
    // Legacy apply-only payment op — customer-approved strategy lives in paymentImpactJson (Pass 2 materializer).
    operations.push({
      opId: `payment:${params.changeOrderId ?? "draft"}`,
      type: "UPDATE_PAYMENT_REQUIREMENT",
      targetEntityType: "JobPaymentRequirement",
      payload: {
        amountCents: params.priceDeltaCents,
        title: params.number
          ? `Change Order CO-${String(params.number).padStart(3, "0")}`
          : "Change Order",
      },
      reason: "Reconcile approved Change Order price delta with runtime payment truth.",
      requiresCustomerApproval: true,
    });
  }

  return {
    schemaVersion: CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
    baseJobPlanVersion: params.baseJobPlanVersion,
    summary: "Default execution delta generated from Change Order commercial lines.",
    operations,
    meta: {
      source: "change-order-default-builder",
      legacyScopeReconciliation: true,
    },
  };
}
