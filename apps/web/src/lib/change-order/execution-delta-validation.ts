import { JobScopeItemStatus, JobTaskStatus } from "@prisma/client";
import { validateChangeOrderPaymentImpactGate } from "@/lib/change-order/payment-impact-gates";
import { validateScopeRevisionApplyGuards } from "@/lib/quote-scope-revision-apply-guards";
import {
  parseChangeOrderExecutionDelta,
  type ChangeOrderExecutionDeltaOperation,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";

export type ExecutionDeltaScopeItem = {
  id: string;
  executionRelevant: boolean;
  status: JobScopeItemStatus;
};

export type ExecutionDeltaTask = {
  id: string;
  status: JobTaskStatus;
  hardSignal: boolean;
  requiresSignals: string[];
  providesSignals: string[];
  jobScopeItemIds: string[];
};

export type ExecutionDeltaValidationInput = {
  rawDelta: unknown;
  baseJobPlanVersion: number;
  currentJobPlanVersion: number;
  priceDeltaCents: number;
  paymentImpactJson?: unknown;
  /** Draft persist / send pre-check: allow price impact without saved payment terms. */
  allowMissingPaymentImpactForDraft?: boolean;
  scopeItems: ExecutionDeltaScopeItem[];
  tasks: ExecutionDeltaTask[];
};

export type ExecutionDeltaValidationResult =
  | { ok: true; proposal: ChangeOrderExecutionDeltaProposal }
  | {
      ok: false;
      classification: "SCHEMA_INVALID" | "STALE_PLAN" | "CONFLICT" | "INVARIANT_FAILED";
      errors: string[];
      proposal?: ChangeOrderExecutionDeltaProposal;
    };

function opVirtualScopeId(opId: string): string {
  return `op:${opId}`;
}

function getStringArrayPayload(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
): string[] {
  const value = operation.payload?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function getBooleanPayload(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
  fallback: boolean,
): boolean {
  const value = operation.payload?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export function validateChangeOrderExecutionDelta(
  input: ExecutionDeltaValidationInput,
): ExecutionDeltaValidationResult {
  const parsed = parseChangeOrderExecutionDelta(input.rawDelta);
  if (!parsed.ok) {
    return { ok: false, classification: "SCHEMA_INVALID", errors: parsed.errors };
  }

  const proposal = parsed.proposal;
  if (proposal.baseJobPlanVersion !== input.baseJobPlanVersion) {
    return {
      ok: false,
      classification: "CONFLICT",
      proposal,
      errors: [
        `Execution delta base version ${proposal.baseJobPlanVersion} does not match Change Order base version ${input.baseJobPlanVersion}.`,
      ],
    };
  }

  if (input.currentJobPlanVersion !== input.baseJobPlanVersion) {
    return {
      ok: false,
      classification: "STALE_PLAN",
      proposal,
      errors: [
        `Job plan changed from ${input.baseJobPlanVersion} to ${input.currentJobPlanVersion}. Execution review is required before apply.`,
      ],
    };
  }

  const scopeById = new Map(input.scopeItems.map((scope) => [scope.id, { ...scope }]));
  const taskById = new Map(input.tasks.map((task) => [task.id, { ...task, jobScopeItemIds: [...task.jobScopeItemIds] }]));
  let hasLegacyPaymentOperation = false;
  const errors: string[] = [];

  for (const operation of proposal.operations) {
    switch (operation.type) {
      case "ADD_SCOPE_ITEM": {
        scopeById.set(opVirtualScopeId(operation.opId), {
          id: opVirtualScopeId(operation.opId),
          executionRelevant: getBooleanPayload(operation, "executionRelevant", true),
          status: JobScopeItemStatus.ACTIVE,
        });
        break;
      }
      case "MODIFY_SCOPE_ITEM": {
        if (!operation.targetEntityId) {
          errors.push(`${operation.opId}: MODIFY_SCOPE_ITEM requires targetEntityId.`);
          break;
        }
        const source = scopeById.get(operation.targetEntityId);
        if (!source || source.status !== JobScopeItemStatus.ACTIVE) {
          errors.push(`${operation.opId}: target scope must exist and be ACTIVE.`);
          break;
        }
        source.status = JobScopeItemStatus.SUPERSEDED;
        const replacementId = opVirtualScopeId(operation.opId);
        scopeById.set(replacementId, {
          id: replacementId,
          executionRelevant: getBooleanPayload(operation, "executionRelevant", source.executionRelevant),
          status: JobScopeItemStatus.ACTIVE,
        });
        for (const task of taskById.values()) {
          if (task.status === JobTaskStatus.DONE || task.status === JobTaskStatus.CANCELED) continue;
          if (task.jobScopeItemIds.includes(operation.targetEntityId)) {
            task.jobScopeItemIds = task.jobScopeItemIds
              .filter((scopeId) => scopeId !== operation.targetEntityId)
              .concat(replacementId);
          }
        }
        break;
      }
      case "REMOVE_SCOPE_ITEM": {
        if (!operation.targetEntityId) {
          errors.push(`${operation.opId}: REMOVE_SCOPE_ITEM requires targetEntityId.`);
          break;
        }
        const source = scopeById.get(operation.targetEntityId);
        if (!source || source.status !== JobScopeItemStatus.ACTIVE) {
          errors.push(`${operation.opId}: target scope must exist and be ACTIVE.`);
          break;
        }
        source.status = JobScopeItemStatus.REMOVED;
        for (const task of taskById.values()) {
          if (task.status === JobTaskStatus.DONE || task.status === JobTaskStatus.CANCELED) continue;
          task.jobScopeItemIds = task.jobScopeItemIds.filter(
            (scopeId) => scopeId !== operation.targetEntityId,
          );
          if (task.jobScopeItemIds.length === 0) {
            task.status = JobTaskStatus.CANCELED;
          }
        }
        break;
      }
      case "ADD_TASK": {
        const scopeIds = [
          ...getStringArrayPayload(operation, "jobScopeItemIds"),
          ...getStringArrayPayload(operation, "scopeOpIds").map(opVirtualScopeId),
        ];
        taskById.set(opVirtualScopeId(operation.opId), {
          id: opVirtualScopeId(operation.opId),
          status: JobTaskStatus.TODO,
          hardSignal: getBooleanPayload(operation, "hardSignal", false),
          requiresSignals: getStringArrayPayload(operation, "requiresSignals"),
          providesSignals: getStringArrayPayload(operation, "providesSignals"),
          jobScopeItemIds: scopeIds,
        });
        break;
      }
      case "CANCEL_TASK": {
        if (!operation.targetEntityId) {
          errors.push(`${operation.opId}: CANCEL_TASK requires targetEntityId.`);
          break;
        }
        const task = taskById.get(operation.targetEntityId);
        if (!task) {
          errors.push(`${operation.opId}: target task not found.`);
          break;
        }
        if (task.status === JobTaskStatus.DONE) {
          errors.push(`${operation.opId}: completed tasks cannot be canceled by Change Order delta.`);
          break;
        }
        if (task.status !== JobTaskStatus.CANCELED) {
          task.status = JobTaskStatus.CANCELED;
        }
        break;
      }
      case "MODIFY_TASK": {
        if (!operation.targetEntityId) {
          errors.push(`${operation.opId}: MODIFY_TASK requires targetEntityId.`);
          break;
        }
        const task = taskById.get(operation.targetEntityId);
        if (!task) {
          errors.push(`${operation.opId}: target task not found.`);
          break;
        }
        const replacementScopeIds = getStringArrayPayload(operation, "jobScopeItemIds");
        if (replacementScopeIds.length > 0) {
          task.jobScopeItemIds = replacementScopeIds;
        }
        task.requiresSignals = getStringArrayPayload(operation, "requiresSignals");
        task.providesSignals = getStringArrayPayload(operation, "providesSignals");
        task.hardSignal = getBooleanPayload(operation, "hardSignal", task.hardSignal);
        break;
      }
      case "UPDATE_PAYMENT_REQUIREMENT":
        hasLegacyPaymentOperation = true;
        break;
    }
  }

  if (errors.length > 0) {
    return { ok: false, classification: "CONFLICT", proposal, errors };
  }

  const paymentImpactGate = validateChangeOrderPaymentImpactGate({
    priceDeltaCents: input.priceDeltaCents,
    paymentImpactJson: input.paymentImpactJson ?? null,
  });
  const hasValidPaymentImpactForApply = paymentImpactGate.ok;

  const skipMissingPaymentImpactRequirement =
    input.allowMissingPaymentImpactForDraft === true && !hasValidPaymentImpactForApply;

  if (input.priceDeltaCents !== 0) {
    if (!hasValidPaymentImpactForApply && !skipMissingPaymentImpactRequirement) {
      errors.push(
        paymentImpactGate.ok
          ? "Change Order payment impact is invalid."
          : paymentImpactGate.error,
      );
      if (!paymentImpactGate.ok && paymentImpactGate.errors?.length) {
        errors.push(...paymentImpactGate.errors);
      }
    }
    if (hasValidPaymentImpactForApply && hasLegacyPaymentOperation) {
      errors.push(
        "Legacy UPDATE_PAYMENT_REQUIREMENT must not coexist with approved paymentImpactJson.",
      );
    }
    if (!hasValidPaymentImpactForApply && hasLegacyPaymentOperation) {
      errors.push(
        "Configure approved payment terms before apply. Legacy execution payment ops are no longer accepted.",
      );
    }
  } else {
    if (hasLegacyPaymentOperation) {
      errors.push("Zero-dollar Change Orders must not include UPDATE_PAYMENT_REQUIREMENT operations.");
    }
    if (input.paymentImpactJson != null) {
      errors.push("Zero-dollar Change Orders must not include payment impact.");
    }
  }

  if (errors.length > 0) {
    return { ok: false, classification: "INVARIANT_FAILED", proposal, errors };
  }

  const guards = validateScopeRevisionApplyGuards({
    priceDeltaCents: input.priceDeltaCents,
    hasApprovedPaymentImpactOperationInTx: hasLegacyPaymentOperation,
    hasValidPaymentImpactForApply,
    skipPaymentImpactRequirement: skipMissingPaymentImpactRequirement,
    scopeItems: [...scopeById.values()],
    tasks: [...taskById.values()],
  });
  if (!guards.ok) {
    return { ok: false, classification: "INVARIANT_FAILED", proposal, errors: guards.errors };
  }

  return { ok: true, proposal };
}

export function classifyValidationFailureForApplicationStatus(
  classification: Exclude<ExecutionDeltaValidationResult, { ok: true }>["classification"],
): "APPLY_FAILED" | "NEEDS_EXECUTION_REVIEW" {
  return classification === "STALE_PLAN" || classification === "CONFLICT"
    ? "NEEDS_EXECUTION_REVIEW"
    : "APPLY_FAILED";
}
