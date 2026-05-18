import { JobTaskStatus } from "@prisma/client";
import {
  deriveTaskState,
  toTaskReadinessInput,
  type TaskIssueRef,
  type TaskReadinessSource,
} from "@/lib/task-readiness";

export const CHECKLIST_BLOCKED_BY_ISSUE_MESSAGE =
  "Cannot update checklist while this work is blocked by an open issue.";

export const CHECKLIST_COMPLETED_TASK_MESSAGE =
  "Cannot update checklist on a completed task.";

export type ToggleTaskChecklistGuardInput = TaskReadinessSource & {
  issues: TaskIssueRef[];
  jobStage: { issues: TaskIssueRef[] };
  recoveryFlowIssueId?: string | null;
  liveSignals: string[];
  /** Intended toggle: true = mark item done, false = uncheck. */
  completed: boolean;
};

/**
 * Pure gate for toggleJobTaskChecklistItemAction.
 * Blocks marking checklist items done under BLOCKED_BY_ISSUE; allows uncheck and signal-only blocks.
 */
export function assertCanToggleTaskChecklistItem(
  task: ToggleTaskChecklistGuardInput,
): { ok: true } | { ok: false; error: string } {
  if (task.status === JobTaskStatus.DONE || task.completedAt) {
    return { ok: false, error: CHECKLIST_COMPLETED_TASK_MESSAGE };
  }

  if (!task.completed) {
    return { ok: true };
  }

  const readinessInput = toTaskReadinessInput(task, {
    requiresSignals: [],
    issues: task.jobStage.issues,
  });

  const state = deriveTaskState(readinessInput, task.liveSignals, {
    recoveryFlowIssueId: task.recoveryFlowIssueId,
  });

  if (state === "BLOCKED_BY_ISSUE") {
    return { ok: false, error: CHECKLIST_BLOCKED_BY_ISSUE_MESSAGE };
  }

  return { ok: true };
}
