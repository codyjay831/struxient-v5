import { JobTaskStatus } from "@prisma/client";
import {
  CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  type ChangeOrderExecutionDeltaOperation,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";

export type ChangeOrderComposerTaskSnapshot = {
  id: string;
  title: string;
  status: JobTaskStatus;
  scopeItemIds: string[];
  instructions?: string | null;
};

export const MANUAL_TASK_COMPOSER_SOURCE = "change-order-task-composer";
export const GENERATED_TASK_INTERNAL_NOTE = "Generated from the commercial Change Order line.";

export type TaskOperationSourceKind =
  | "generated"
  | "manual_reviewed"
  | "manual_added"
  | "manual_cancel"
  | "manual_modify";

const TASK_OPERATION_TYPES = new Set<ChangeOrderExecutionDeltaOperation["type"]>([
  "ADD_TASK",
  "CANCEL_TASK",
  "MODIFY_TASK",
]);

export function isExecutionTaskComposerEditable(input: {
  status: import("@prisma/client").ChangeOrderStatus;
  applicationStatus: import("@prisma/client").ChangeOrderApplicationStatus;
}): boolean {
  if (
    input.status !== "DRAFT" &&
    input.status !== "CUSTOMER_REQUESTED_CHANGES"
  ) {
    return false;
  }
  return (
    input.applicationStatus !== "NEEDS_EXECUTION_REVIEW" &&
    input.applicationStatus !== "APPLY_FAILED"
  );
}

export function isGeneratedAddTaskOperation(
  operation: ChangeOrderExecutionDeltaOperation,
): boolean {
  if (operation.type !== "ADD_TASK") return false;
  if (operation.internalNote === GENERATED_TASK_INTERNAL_NOTE) return true;
  const meta = operation.payload?.meta;
  return Boolean(
    meta &&
      typeof meta === "object" &&
      "generated" in meta &&
      meta.generated === true,
  );
}

function manualComposerPayload(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    composerSource: MANUAL_TASK_COMPOSER_SOURCE,
  };
}

export function getTaskOperationSourceKind(
  operation: ChangeOrderExecutionDeltaOperation,
): TaskOperationSourceKind {
  if (isGeneratedAddTaskOperation(operation)) {
    return "generated";
  }
  const composerSource = operation.payload?.composerSource;
  if (composerSource === MANUAL_TASK_COMPOSER_SOURCE) {
    if (operation.type === "ADD_TASK") return "manual_added";
    if (operation.type === "CANCEL_TASK") return "manual_cancel";
    if (operation.type === "MODIFY_TASK") return "manual_modify";
  }
  if (operation.type === "ADD_TASK") return "manual_reviewed";
  if (operation.type === "CANCEL_TASK" || operation.type === "MODIFY_TASK") {
    return "manual_modify";
  }
  return "manual_reviewed";
}

export function taskOperationSourceLabel(kind: TaskOperationSourceKind): string {
  switch (kind) {
    case "generated":
      return "Draft task suggestion — office must review before sending.";
    case "manual_added":
      return "Manually added";
    case "manual_cancel":
      return "Manually added cancellation";
    case "manual_modify":
      return "Manually added task change";
    case "manual_reviewed":
      return "Manually reviewed";
  }
}

export function mapValidationErrorsByOpId(
  errors: string[],
  knownOpIds?: Iterable<string>,
): Map<string, string[]> {
  const byOpId = new Map<string, string[]>();
  const opIdList = knownOpIds
    ? [...knownOpIds].sort((left, right) => right.length - left.length)
    : null;

  for (const error of errors) {
    let opId: string | null = null;
    let message: string | null = null;

    if (opIdList) {
      for (const candidate of opIdList) {
        const prefix = `${candidate}: `;
        if (error.startsWith(prefix)) {
          opId = candidate;
          message = error.slice(prefix.length);
          break;
        }
      }
    }

    if (!opId) {
      const match = error.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        opId = match[1] ?? null;
        message = match[2] ?? null;
      }
    }

    if (!opId || !message) continue;
    const existing = byOpId.get(opId) ?? [];
    existing.push(message);
    byOpId.set(opId, existing);
  }
  return byOpId;
}

export function isOpScopedValidationError(
  error: string,
  knownOpIds?: Iterable<string>,
): boolean {
  if (knownOpIds) {
    for (const candidate of knownOpIds) {
      if (error.startsWith(`${candidate}: `)) {
        return true;
      }
    }
  }
  return /^[^:]+:\s*.+$/.test(error);
}

export function globalValidationErrors(
  errors: string[],
  knownOpIds?: Iterable<string>,
): string[] {
  return errors.filter((error) => !isOpScopedValidationError(error, knownOpIds));
}

export function getTargetedTaskIds(proposal: ChangeOrderExecutionDeltaProposal): {
  cancelTaskIds: Set<string>;
  modifyTaskIds: Set<string>;
} {
  const cancelTaskIds = new Set<string>();
  const modifyTaskIds = new Set<string>();
  for (const operation of proposal.operations) {
    if (operation.type === "CANCEL_TASK" && operation.targetEntityId) {
      cancelTaskIds.add(operation.targetEntityId);
    }
    if (operation.type === "MODIFY_TASK" && operation.targetEntityId) {
      modifyTaskIds.add(operation.targetEntityId);
    }
  }
  return { cancelTaskIds, modifyTaskIds };
}

export function canSelectTaskForCancel(
  task: ChangeOrderComposerTaskSnapshot,
  cancelTaskIds: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  if (task.status === JobTaskStatus.DONE) {
    return { ok: false, reason: "Cannot cancel a completed task." };
  }
  if (task.status === JobTaskStatus.CANCELED) {
    return { ok: false, reason: "This task is already canceled." };
  }
  if (cancelTaskIds.has(task.id)) {
    return { ok: false, reason: "This task already has a cancellation operation." };
  }
  return { ok: true };
}

export function canSelectTaskForModify(
  task: ChangeOrderComposerTaskSnapshot,
  modifyTaskIds: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  if (task.status === JobTaskStatus.DONE) {
    return { ok: false, reason: "Completed tasks cannot be modified." };
  }
  if (task.status === JobTaskStatus.CANCELED) {
    return { ok: false, reason: "Canceled tasks cannot be modified." };
  }
  if (modifyTaskIds.has(task.id)) {
    return { ok: false, reason: "This task already has a modify operation." };
  }
  return { ok: true };
}

export function createManualCancelTaskOperation(input: {
  taskId: string;
  reason: string;
  internalNote?: string;
}): ChangeOrderExecutionDeltaOperation {
  return {
    opId: `manual-cancel:${input.taskId}`,
    type: "CANCEL_TASK",
    targetEntityType: "JobTask",
    targetEntityId: input.taskId,
    reason: input.reason.trim(),
    internalNote: input.internalNote?.trim() || undefined,
    payload: manualComposerPayload(),
  };
}

export function createManualModifyTaskOperation(input: {
  taskId: string;
  title?: string;
  instructions?: string;
  jobScopeItemIds?: string[];
  reason: string;
  internalNote?: string;
}): ChangeOrderExecutionDeltaOperation {
  const payload: Record<string, unknown> = {};
  if (input.title?.trim()) payload.title = input.title.trim();
  if (input.instructions != null) payload.instructions = input.instructions.trim();
  if (input.jobScopeItemIds && input.jobScopeItemIds.length > 0) {
    payload.jobScopeItemIds = input.jobScopeItemIds;
  }
  return {
    opId: `manual-modify:${input.taskId}`,
    type: "MODIFY_TASK",
    targetEntityType: "JobTask",
    targetEntityId: input.taskId,
    payload: manualComposerPayload(payload),
    reason: input.reason.trim(),
    internalNote: input.internalNote?.trim() || undefined,
  };
}

export function createManualAddTaskOperation(input: {
  opId?: string;
  title: string;
  instructions?: string;
  jobScopeItemIds?: string[];
  reason: string;
  internalNote?: string;
}): ChangeOrderExecutionDeltaOperation {
  return {
    opId: input.opId ?? `manual-add:${crypto.randomUUID()}`,
    type: "ADD_TASK",
    targetEntityType: "JobTask",
    payload: manualComposerPayload({
      title: input.title.trim(),
      instructions: input.instructions?.trim() ?? "",
      jobScopeItemIds: input.jobScopeItemIds ?? [],
      category: "GENERAL",
    }),
    reason: input.reason.trim(),
    internalNote: input.internalNote?.trim() || undefined,
  };
}

export function addTaskOperationToProposal(
  proposal: ChangeOrderExecutionDeltaProposal,
  operation: ChangeOrderExecutionDeltaOperation,
): ChangeOrderExecutionDeltaProposal {
  const existing = proposal.operations.find((row) => row.opId === operation.opId);
  if (existing) {
    throw new Error("An operation with this id already exists.");
  }
  return {
    ...proposal,
    operations: [...proposal.operations, operation],
  };
}

export function removeTaskOperationFromProposal(
  proposal: ChangeOrderExecutionDeltaProposal,
  opId: string,
): ChangeOrderExecutionDeltaProposal {
  const operation = proposal.operations.find((row) => row.opId === opId);
  if (!operation || !TASK_OPERATION_TYPES.has(operation.type)) {
    throw new Error("Only task operations can be removed from the composer.");
  }
  return {
    ...proposal,
    operations: proposal.operations.filter((row) => row.opId !== opId),
  };
}

export function updateTaskOperationInProposal(
  proposal: ChangeOrderExecutionDeltaProposal,
  opId: string,
  patch: {
    title?: string;
    instructions?: string;
    reason?: string;
    internalNote?: string | null;
    jobScopeItemIds?: string[];
  },
): ChangeOrderExecutionDeltaProposal {
  return {
    ...proposal,
    operations: proposal.operations.map((operation) => {
      if (operation.opId !== opId) return operation;
      if (!TASK_OPERATION_TYPES.has(operation.type)) return operation;

      const nextPayload = { ...operation.payload };
      if (patch.title !== undefined && operation.type === "ADD_TASK") {
        nextPayload.title = patch.title;
      }
      if (patch.title !== undefined && operation.type === "MODIFY_TASK") {
        nextPayload.title = patch.title;
      }
      if (patch.instructions !== undefined) {
        nextPayload.instructions = patch.instructions;
      }
      if (patch.jobScopeItemIds !== undefined && operation.type === "MODIFY_TASK") {
        nextPayload.jobScopeItemIds = patch.jobScopeItemIds;
      }

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
        payload: manualComposerPayload({
          ...nextPayload,
          composerEditedAt: new Date().toISOString(),
        }),
      };
    }),
  };
}

export function ensureProposalForComposer(
  proposal: ChangeOrderExecutionDeltaProposal | null,
  baseJobPlanVersion: number,
): ChangeOrderExecutionDeltaProposal {
  if (proposal) return proposal;
  return {
    schemaVersion: CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
    baseJobPlanVersion,
    summary: "Execution delta edited in Change Order task composer.",
    operations: [],
    meta: { source: MANUAL_TASK_COMPOSER_SOURCE },
  };
}

export function addManualCancelTaskToProposal(input: {
  proposal: ChangeOrderExecutionDeltaProposal;
  task: ChangeOrderJobTaskSnapshot;
  reason: string;
  internalNote?: string;
}): { ok: true; proposal: ChangeOrderExecutionDeltaProposal } | { ok: false; error: string } {
  const { cancelTaskIds } = getTargetedTaskIds(input.proposal);
  const allowed = canSelectTaskForCancel(input.task, cancelTaskIds);
  if (!allowed.ok) return allowed;

  if (!input.reason.trim()) {
    return { ok: false, error: "Reason is required for task cancellation." };
  }

  try {
    return {
      ok: true,
      proposal: addTaskOperationToProposal(
        input.proposal,
        createManualCancelTaskOperation({
          taskId: input.task.id,
          reason: input.reason,
          internalNote: input.internalNote,
        }),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add cancellation.",
    };
  }
}

export function addManualModifyTaskToProposal(input: {
  proposal: ChangeOrderExecutionDeltaProposal;
  task: ChangeOrderJobTaskSnapshot;
  title?: string;
  instructions?: string;
  jobScopeItemIds?: string[];
  reason: string;
  internalNote?: string;
}): { ok: true; proposal: ChangeOrderExecutionDeltaProposal } | { ok: false; error: string } {
  const { modifyTaskIds } = getTargetedTaskIds(input.proposal);
  const allowed = canSelectTaskForModify(input.task, modifyTaskIds);
  if (!allowed.ok) return allowed;

  if (!input.reason.trim()) {
    return { ok: false, error: "Reason is required for task changes." };
  }

  const hasFieldChange =
    (input.title?.trim() ?? "") !== input.task.title.trim() ||
    (input.instructions?.trim() ?? "") !== (input.task.instructions?.trim() ?? "") ||
    (input.jobScopeItemIds &&
      JSON.stringify(input.jobScopeItemIds) !== JSON.stringify(input.task.scopeItemIds));

  if (!hasFieldChange) {
    return { ok: false, error: "Change at least one task field before saving." };
  }

  try {
    return {
      ok: true,
      proposal: addTaskOperationToProposal(
        input.proposal,
        createManualModifyTaskOperation({
          taskId: input.task.id,
          title: input.title,
          instructions: input.instructions,
          jobScopeItemIds: input.jobScopeItemIds,
          reason: input.reason,
          internalNote: input.internalNote,
        }),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add task change.",
    };
  }
}

export function addManualAddTaskToProposal(input: {
  proposal: ChangeOrderExecutionDeltaProposal;
  title: string;
  instructions?: string;
  jobScopeItemIds?: string[];
  reason: string;
  internalNote?: string;
}): { ok: true; proposal: ChangeOrderExecutionDeltaProposal } | { ok: false; error: string } {
  if (!input.title.trim()) {
    return { ok: false, error: "Task title is required." };
  }
  if (!input.reason.trim()) {
    return { ok: false, error: "Reason is required for new tasks." };
  }

  try {
    return {
      ok: true,
      proposal: addTaskOperationToProposal(
        input.proposal,
        createManualAddTaskOperation(input),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add task.",
    };
  }
}

export function userFacingValidationMessage(message: string): string {
  if (/completed tasks cannot be canceled/i.test(message)) {
    return "Cannot cancel a completed task.";
  }
  if (/target task not found/i.test(message)) {
    return "This task no longer exists or was changed. Review execution impact.";
  }
  if (/Payment requirement amount .* does not match/i.test(message)) {
    return "Payment impact must match change order price delta.";
  }
  return message;
}
