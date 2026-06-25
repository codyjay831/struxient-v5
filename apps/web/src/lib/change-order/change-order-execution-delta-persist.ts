import { ChangeOrderLineOperation } from "@prisma/client";
import {
  isOfficeReviewConfirmedOperation,
  MANUAL_TASK_COMPOSER_SOURCE,
} from "@/lib/change-order/change-order-execution-task-composer";
import { buildDefaultExecutionDeltaFromChangeOrderLines } from "@/lib/change-order/execution-delta-build";
import { parseNoWorkImpactConfirmed } from "@/lib/change-order/execution-delta-no-work-impact";
import {
  parseChangeOrderExecutionDelta,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import type { ChangeOrderLineForExecutionDelta } from "@/lib/change-order/execution-delta-build";

export type ExecutionLineSnapshot = {
  id: string;
  operation: ChangeOrderLineOperation;
  sourceJobScopeItemId: string | null;
  description: string;
  quantity: string;
  executionRelevant: boolean;
};

export const COMMERCIAL_SAVE_EXECUTION_REVIEW_REQUIRED_ERROR =
  "Commercial changes affect work impact. Review and save work impact before saving commercial changes.";

function lineQuantityString(quantity: { toString(): string } | string): string {
  return typeof quantity === "string" ? quantity : quantity.toString();
}

export function toExecutionLineSnapshot(line: {
  id: string;
  operation: ChangeOrderLineOperation;
  sourceJobScopeItemId: string | null;
  description: string;
  quantity: { toString(): string } | string;
  executionRelevant: boolean;
}): ExecutionLineSnapshot {
  return {
    id: line.id,
    operation: line.operation,
    sourceJobScopeItemId: line.sourceJobScopeItemId,
    description: line.description.trim(),
    quantity: lineQuantityString(line.quantity).trim(),
    executionRelevant: line.executionRelevant,
  };
}

function executionLineFingerprint(line: ExecutionLineSnapshot): string {
  return JSON.stringify({
    operation: line.operation,
    sourceJobScopeItemId: line.sourceJobScopeItemId,
    description: line.description,
    quantity: line.quantity,
    executionRelevant: line.executionRelevant,
  });
}

export function executionLineStructuresEqual(
  previousLines: ExecutionLineSnapshot[],
  nextLines: ExecutionLineSnapshot[],
): boolean {
  if (previousLines.length !== nextLines.length) return false;
  const previous = previousLines.map(executionLineFingerprint).sort();
  const next = nextLines.map(executionLineFingerprint).sort();
  return previous.every((value, index) => value === next[index]);
}

export function buildExecutionLineIdRemap(
  previousLines: ExecutionLineSnapshot[],
  nextLines: ExecutionLineSnapshot[],
): Map<string, string> | null {
  if (!executionLineStructuresEqual(previousLines, nextLines)) {
    return null;
  }

  const previousSorted = [...previousLines].sort((left, right) =>
    executionLineFingerprint(left).localeCompare(executionLineFingerprint(right)),
  );
  const nextSorted = [...nextLines].sort((left, right) =>
    executionLineFingerprint(left).localeCompare(executionLineFingerprint(right)),
  );

  const remap = new Map<string, string>();
  for (let index = 0; index < previousSorted.length; index += 1) {
    remap.set(previousSorted[index]!.id, nextSorted[index]!.id);
  }
  return remap;
}

function remapLineLinkedId(
  value: string | null | undefined,
  lineIdRemap: Map<string, string>,
): string | undefined {
  if (!value) return undefined;
  return lineIdRemap.get(value) ?? value;
}

function remapScopeOrTaskOpId(opId: string, lineIdRemap: Map<string, string>): string {
  if (opId.startsWith("scope:")) {
    return `scope:${remapLineLinkedId(opId.slice("scope:".length), lineIdRemap) ?? opId.slice("scope:".length)}`;
  }
  if (opId.startsWith("task:")) {
    return `task:${remapLineLinkedId(opId.slice("task:".length), lineIdRemap) ?? opId.slice("task:".length)}`;
  }
  return opId;
}

export function remapExecutionDeltaChangeOrderLineIds(
  proposal: ChangeOrderExecutionDeltaProposal,
  lineIdRemap: Map<string, string>,
): ChangeOrderExecutionDeltaProposal {
  return {
    ...proposal,
    operations: proposal.operations.map((operation) => {
      const nextPayload = operation.payload ? { ...operation.payload } : undefined;
      if (nextPayload) {
        if (typeof nextPayload.changeOrderLineId === "string") {
          nextPayload.changeOrderLineId = remapLineLinkedId(
            nextPayload.changeOrderLineId,
            lineIdRemap,
          );
        }
        if (typeof nextPayload.generatedFromChangeOrderLineId === "string") {
          nextPayload.generatedFromChangeOrderLineId = remapLineLinkedId(
            nextPayload.generatedFromChangeOrderLineId,
            lineIdRemap,
          );
        }
        if (Array.isArray(nextPayload.scopeOpIds)) {
          nextPayload.scopeOpIds = nextPayload.scopeOpIds
            .filter((value): value is string => typeof value === "string")
            .map((value) => remapScopeOrTaskOpId(value, lineIdRemap));
        }
        if (Array.isArray(nextPayload.jobScopeItemIds)) {
          nextPayload.jobScopeItemIds = nextPayload.jobScopeItemIds
            .filter((value): value is string => typeof value === "string")
            .map((value) => remapLineLinkedId(value, lineIdRemap) ?? value);
        }
      }

      return {
        ...operation,
        opId: remapScopeOrTaskOpId(operation.opId, lineIdRemap),
        linkedChangeOrderLineId: remapLineLinkedId(
          operation.linkedChangeOrderLineId ?? null,
          lineIdRemap,
        ),
        payload: nextPayload,
      };
    }),
  };
}

export function storedExecutionDeltaHasCustomWork(
  proposal: ChangeOrderExecutionDeltaProposal,
): boolean {
  if (parseNoWorkImpactConfirmed(proposal.meta)) {
    return true;
  }

  return proposal.operations.some((operation) => {
    if (operation.type === "ADD_TASK" && isOfficeReviewConfirmedOperation(operation)) {
      return true;
    }
    if (operation.payload?.composerSource === MANUAL_TASK_COMPOSER_SOURCE) {
      return true;
    }
    if (operation.opId.startsWith("manual-")) {
      return true;
    }
    if (operation.type === "CANCEL_TASK" || operation.type === "MODIFY_TASK") {
      return true;
    }
    return false;
  });
}

export function resolveExecutionDeltaForChangeOrderPersist(input: {
  executionDeltaOverride: ChangeOrderExecutionDeltaProposal | null | undefined;
  storedExecutionDeltaJson: unknown;
  previousLines: ExecutionLineSnapshot[];
  nextLines: ExecutionLineSnapshot[];
  buildDefault: () => ChangeOrderExecutionDeltaProposal;
}):
  | { ok: true; proposal: ChangeOrderExecutionDeltaProposal }
  | { ok: false; error: string } {
  if (input.executionDeltaOverride !== undefined) {
    if (input.executionDeltaOverride === null) {
      return { ok: true, proposal: input.buildDefault() };
    }
    return { ok: true, proposal: input.executionDeltaOverride };
  }

  const storedParsed = parseChangeOrderExecutionDelta(input.storedExecutionDeltaJson);
  if (!storedParsed.ok || storedParsed.proposal.operations.length === 0) {
    return { ok: true, proposal: input.buildDefault() };
  }

  if (executionLineStructuresEqual(input.previousLines, input.nextLines)) {
    const lineIdRemap = buildExecutionLineIdRemap(input.previousLines, input.nextLines);
    if (!lineIdRemap) {
      return { ok: true, proposal: input.buildDefault() };
    }
    return {
      ok: true,
      proposal: remapExecutionDeltaChangeOrderLineIds(storedParsed.proposal, lineIdRemap),
    };
  }

  if (storedExecutionDeltaHasCustomWork(storedParsed.proposal)) {
    return { ok: false, error: COMMERCIAL_SAVE_EXECUTION_REVIEW_REQUIRED_ERROR };
  }

  return { ok: true, proposal: input.buildDefault() };
}

export function buildDefaultExecutionDeltaFromPersistLines(input: {
  baseJobPlanVersion: number;
  changeOrderId: string;
  changeOrderNumber: number;
  priceDeltaCents: number;
  reasoning: string;
  lines: ChangeOrderLineForExecutionDelta[];
  skipLegacyPaymentOperation: boolean;
}): ChangeOrderExecutionDeltaProposal {
  return buildDefaultExecutionDeltaFromChangeOrderLines({
    baseJobPlanVersion: input.baseJobPlanVersion,
    changeOrderId: input.changeOrderId,
    number: input.changeOrderNumber,
    priceDeltaCents: input.priceDeltaCents,
    reasoning: input.reasoning,
    lines: input.lines,
    skipLegacyPaymentOperation: input.skipLegacyPaymentOperation,
  });
}
