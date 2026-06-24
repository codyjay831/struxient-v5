import { ChangeOrderApplicationStatus, JobTaskStatus } from "@prisma/client";
import {
  parseChangeOrderExecutionDelta,
  type ChangeOrderExecutionDeltaOperation,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import { validateChangeOrderExecutionDelta } from "@/lib/change-order/execution-delta-validation";
import {
  getTaskOperationSourceKind,
  mapValidationErrorsByOpId,
  taskOperationSourceLabel,
  userFacingValidationMessage,
} from "@/lib/change-order/change-order-execution-task-composer";

export type ChangeOrderJobTaskSnapshot = {
  id: string;
  title: string;
  status: JobTaskStatus;
  scopeItemIds: string[];
  instructions?: string | null;
};

export type ChangeOrderExecutionTaskOpView = {
  opId: string;
  type: "ADD_TASK" | "CANCEL_TASK" | "MODIFY_TASK";
  taskTitle: string;
  instructions: string | null;
  affectedScopeLabels: string[];
  existingTaskStatus: JobTaskStatus | null;
  reason: string;
  internalNote: string | null;
  sourceKind: import("@/lib/change-order/change-order-execution-task-composer").TaskOperationSourceKind;
  sourceLabel: string;
  isGenerated: boolean;
  validationErrors: string[];
  canRemove: boolean;
};

export type ChangeOrderExecutionPaymentOpView = {
  opId: string;
  amountCents: number;
  title: string;
  reason: string;
  isGenerated: boolean;
  validationErrors: string[];
};

export type ChangeOrderExecutionImpactView = {
  parsed: boolean;
  parseErrors: string[];
  summary: string | null;
  baseJobPlanVersion: number | null;
  addedTasks: ChangeOrderExecutionTaskOpView[];
  canceledTasks: ChangeOrderExecutionTaskOpView[];
  modifiedTasks: ChangeOrderExecutionTaskOpView[];
  paymentImpact: ChangeOrderExecutionPaymentOpView | null;
  scopeOperationCount: number;
  validationOk: boolean;
  validationErrors: string[];
  stalePlan: boolean;
  conflict: boolean;
};

export type ChangeOrderLifecycleReadiness =
  | "DRAFT_INCOMPLETE"
  | "EXECUTION_NEEDS_REVIEW"
  | "READY_TO_SEND"
  | "SENT_WAITING"
  | "CUSTOMER_REQUESTED_CHANGES"
  | "ACCEPTED_READY_TO_APPLY"
  | "ACCEPTED_NEEDS_EXECUTION_REVIEW"
  | "APPLY_FAILED"
  | "APPLIED";

export type ChangeOrderApplyErrorSummary = {
  classification: string | null;
  messages: string[];
};

const TASK_OP_TYPES = new Set<ChangeOrderExecutionTaskOpView["type"]>([
  "ADD_TASK",
  "CANCEL_TASK",
  "MODIFY_TASK",
]);

function payloadString(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
  fallback = "",
): string {
  const value = operation.payload?.[key];
  return typeof value === "string" ? value : fallback;
}

function payloadNumber(
  operation: ChangeOrderExecutionDeltaOperation,
  key: string,
  fallback = 0,
): number {
  const value = operation.payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function resolveScopeLabels(
  operation: ChangeOrderExecutionDeltaOperation,
  scopeLabelById: Map<string, string>,
  taskById: Map<string, ChangeOrderJobTaskSnapshot>,
): string[] {
  if (operation.type === "ADD_TASK") {
    const jobScopeItemIds = operation.payload?.jobScopeItemIds;
    if (Array.isArray(jobScopeItemIds)) {
      return jobScopeItemIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => scopeLabelById.get(id) ?? id);
    }
    const scopeOpIds = operation.payload?.scopeOpIds;
    if (Array.isArray(scopeOpIds)) {
      return scopeOpIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => scopeLabelById.get(id) ?? id);
    }
    return [];
  }

  if (operation.type === "MODIFY_TASK") {
    const replacementScopeIds = operation.payload?.jobScopeItemIds;
    if (Array.isArray(replacementScopeIds) && replacementScopeIds.length > 0) {
      return replacementScopeIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => scopeLabelById.get(id) ?? id);
    }
  }

  if (operation.targetEntityId) {
    const task = taskById.get(operation.targetEntityId);
    if (task) {
      return task.scopeItemIds.map((id) => scopeLabelById.get(id) ?? id);
    }
    return [scopeLabelById.get(operation.targetEntityId) ?? operation.targetEntityId];
  }

  return [];
}

function taskTitleFromOperation(
  operation: ChangeOrderExecutionDeltaOperation,
  taskById: Map<string, ChangeOrderJobTaskSnapshot>,
): string {
  if (operation.type === "ADD_TASK") {
    return payloadString(operation, "title", "New task");
  }
  if (operation.targetEntityId) {
    return taskById.get(operation.targetEntityId)?.title ?? operation.targetEntityId;
  }
  return "Task change";
}

function toTaskOpView(
  operation: ChangeOrderExecutionDeltaOperation,
  scopeLabelById: Map<string, string>,
  taskById: Map<string, ChangeOrderJobTaskSnapshot>,
  validationErrors: string[],
): ChangeOrderExecutionTaskOpView | null {
  if (!TASK_OP_TYPES.has(operation.type as ChangeOrderExecutionTaskOpView["type"])) {
    return null;
  }

  const type = operation.type as ChangeOrderExecutionTaskOpView["type"];
  const existingTaskStatus =
    operation.targetEntityId && type !== "ADD_TASK"
      ? taskById.get(operation.targetEntityId)?.status ?? null
      : null;
  const sourceKind = getTaskOperationSourceKind(operation);

  return {
    opId: operation.opId,
    type,
    taskTitle: taskTitleFromOperation(operation, taskById),
    instructions:
      type === "ADD_TASK" || type === "MODIFY_TASK"
        ? payloadString(operation, "instructions") || null
        : null,
    affectedScopeLabels: resolveScopeLabels(operation, scopeLabelById, taskById),
    existingTaskStatus,
    reason: operation.reason,
    internalNote: operation.internalNote ?? null,
    sourceKind,
    sourceLabel: taskOperationSourceLabel(sourceKind),
    isGenerated: sourceKind === "generated",
    validationErrors: validationErrors.map(userFacingValidationMessage),
    canRemove: true,
  };
}

export function parseApplyErrorSummary(lastApplyErrorJson: unknown): ChangeOrderApplyErrorSummary {
  if (!lastApplyErrorJson || typeof lastApplyErrorJson !== "object") {
    return { classification: null, messages: [] };
  }
  const record = lastApplyErrorJson as Record<string, unknown>;
  const classification = typeof record.classification === "string" ? record.classification : null;
  const messages = Array.isArray(record.errors)
    ? record.errors.filter((item): item is string => typeof item === "string")
    : [];
  return { classification, messages };
}

export function deriveChangeOrderLifecycleReadiness(input: {
  status: import("@prisma/client").ChangeOrderStatus;
  applicationStatus: ChangeOrderApplicationStatus;
  draftCommercialValid: boolean;
  executionValidationOk: boolean;
  hasGeneratedTaskSuggestions: boolean;
  stalePlan: boolean;
}): ChangeOrderLifecycleReadiness {
  if (input.status === "APPLIED" || input.applicationStatus === "APPLIED") {
    return "APPLIED";
  }
  if (input.applicationStatus === "APPLY_FAILED") {
    return "APPLY_FAILED";
  }
  if (
    input.status === "ACCEPTED" &&
    (input.applicationStatus === "NEEDS_EXECUTION_REVIEW" || input.stalePlan)
  ) {
    return "ACCEPTED_NEEDS_EXECUTION_REVIEW";
  }
  if (input.status === "ACCEPTED") {
    return input.executionValidationOk ? "ACCEPTED_READY_TO_APPLY" : "ACCEPTED_NEEDS_EXECUTION_REVIEW";
  }
  if (input.status === "CUSTOMER_REQUESTED_CHANGES") {
    return "CUSTOMER_REQUESTED_CHANGES";
  }
  if (input.status === "SENT") {
    return "SENT_WAITING";
  }
  if (input.status === "DRAFT") {
    if (!input.draftCommercialValid) return "DRAFT_INCOMPLETE";
    if (!input.executionValidationOk || input.hasGeneratedTaskSuggestions || input.stalePlan) {
      return "EXECUTION_NEEDS_REVIEW";
    }
    return "READY_TO_SEND";
  }
  return "DRAFT_INCOMPLETE";
}

export function changeOrderLifecycleReadinessLabel(state: ChangeOrderLifecycleReadiness): string {
  switch (state) {
    case "DRAFT_INCOMPLETE":
      return "Draft incomplete";
    case "EXECUTION_NEEDS_REVIEW":
      return "Execution impact needs review";
    case "READY_TO_SEND":
      return "Ready to send";
    case "SENT_WAITING":
      return "Sent, waiting for customer";
    case "CUSTOMER_REQUESTED_CHANGES":
      return "Customer requested changes";
    case "ACCEPTED_READY_TO_APPLY":
      return "Accepted, ready to apply";
    case "ACCEPTED_NEEDS_EXECUTION_REVIEW":
      return "Accepted but needs execution review";
    case "APPLY_FAILED":
      return "Apply failed";
    case "APPLIED":
      return "Applied";
  }
}

export function projectChangeOrderExecutionImpact(input: {
  executionDeltaJson: unknown;
  baseJobPlanVersion: number;
  currentJobPlanVersion: number;
  priceDeltaCents: number;
  scopeItems: Array<{ id: string; description: string; executionRelevant: boolean; status: import("@prisma/client").JobScopeItemStatus }>;
  tasks: ChangeOrderJobTaskSnapshot[];
  scopeLabelsByOpId?: Map<string, string>;
}): ChangeOrderExecutionImpactView {
  const parsed = parseChangeOrderExecutionDelta(input.executionDeltaJson);
  if (!parsed.ok) {
    return {
      parsed: false,
      parseErrors: parsed.errors,
      summary: null,
      baseJobPlanVersion: null,
      addedTasks: [],
      canceledTasks: [],
      modifiedTasks: [],
      paymentImpact: null,
      scopeOperationCount: 0,
      validationOk: false,
      validationErrors: parsed.errors,
      stalePlan: false,
      conflict: false,
    };
  }

  const proposal = parsed.proposal;
  const scopeLabelById = new Map(input.scopeItems.map((item) => [item.id, item.description]));
  const scopeLabelsByOpId =
    input.scopeLabelsByOpId ??
    new Map(
      proposal.operations
        .filter((op) => op.type.startsWith("ADD_SCOPE") || op.type.startsWith("MODIFY_SCOPE") || op.type.startsWith("REMOVE_SCOPE"))
        .map((op) => [op.opId, payloadString(op, "description", op.customerLabel ?? op.opId)]),
    );
  for (const [opId, label] of scopeLabelsByOpId) {
    scopeLabelById.set(opId, label);
  }

  const taskById = new Map(input.tasks.map((task) => [task.id, task]));

  const validation = validateChangeOrderExecutionDelta({
    rawDelta: proposal,
    baseJobPlanVersion: input.baseJobPlanVersion,
    currentJobPlanVersion: input.currentJobPlanVersion,
    priceDeltaCents: input.priceDeltaCents,
    scopeItems: input.scopeItems,
    tasks: input.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      hardSignal: false,
      requiresSignals: [],
      providesSignals: [],
      jobScopeItemIds: task.scopeItemIds,
    })),
  });

  const validationErrors = validation.ok ? [] : validation.errors;
  const knownOpIds = proposal.operations.map((operation) => operation.opId);
  const validationByOpId = mapValidationErrorsByOpId(validationErrors, knownOpIds);
  const stalePlan = !validation.ok && validation.classification === "STALE_PLAN";
  const conflict = !validation.ok && validation.classification === "CONFLICT";

  const addedTasks: ChangeOrderExecutionTaskOpView[] = [];
  const canceledTasks: ChangeOrderExecutionTaskOpView[] = [];
  const modifiedTasks: ChangeOrderExecutionTaskOpView[] = [];
  let paymentImpact: ChangeOrderExecutionPaymentOpView | null = null;
  let scopeOperationCount = 0;

  for (const operation of proposal.operations) {
    if (
      operation.type === "ADD_SCOPE_ITEM" ||
      operation.type === "MODIFY_SCOPE_ITEM" ||
      operation.type === "REMOVE_SCOPE_ITEM"
    ) {
      scopeOperationCount += 1;
      continue;
    }

    if (operation.type === "UPDATE_PAYMENT_REQUIREMENT") {
      paymentImpact = {
        opId: operation.opId,
        amountCents: payloadNumber(operation, "amountCents"),
        title: payloadString(operation, "title", "Change Order payment"),
        reason: operation.reason,
        isGenerated: operation.opId.startsWith("payment:"),
        validationErrors: [],
      };
      continue;
    }

    const view = toTaskOpView(
      operation,
      scopeLabelById,
      taskById,
      validationByOpId.get(operation.opId) ?? [],
    );
    if (!view) continue;

    if (operation.type === "ADD_TASK") addedTasks.push(view);
    if (operation.type === "CANCEL_TASK") canceledTasks.push(view);
    if (operation.type === "MODIFY_TASK") modifiedTasks.push(view);
  }

  return {
    parsed: true,
    parseErrors: [],
    summary: proposal.summary ?? null,
    baseJobPlanVersion: proposal.baseJobPlanVersion,
    addedTasks,
    canceledTasks,
    modifiedTasks,
    paymentImpact,
    scopeOperationCount,
    validationOk: validation.ok,
    validationErrors: validationErrors.map(userFacingValidationMessage),
    stalePlan,
    conflict,
  };
}

export function markTaskOperationManualEdit(
  proposal: ChangeOrderExecutionDeltaProposal,
  opId: string,
  patch: {
    reason?: string;
    internalNote?: string | null;
    title?: string;
  },
): ChangeOrderExecutionDeltaProposal {
  return {
    ...proposal,
    operations: proposal.operations.map((operation) => {
      if (operation.opId !== opId) return operation;
      const nextPayload =
        patch.title && operation.type === "ADD_TASK"
          ? { ...operation.payload, title: patch.title }
          : operation.payload;
      const nextInternalNote =
        patch.internalNote === undefined
          ? operation.internalNote
          : patch.internalNote === null
            ? undefined
            : patch.internalNote;
      return {
        ...operation,
        reason: patch.reason ?? operation.reason,
        internalNote: nextInternalNote,
        payload: nextPayload,
      };
    }),
    meta: {
      ...proposal.meta,
      lastManualEditAt: new Date().toISOString(),
    },
  };
}

export function executionImpactHasGeneratedTaskSuggestions(view: ChangeOrderExecutionImpactView): boolean {
  return view.addedTasks.some((task) => task.isGenerated);
}
