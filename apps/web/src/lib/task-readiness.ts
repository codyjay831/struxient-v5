import { JobIssueStatus, JobIssueSeverity, JobTaskStatus } from "@prisma/client";

export type TaskDerivedState =
  | "COMPLETED"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_SIGNAL"
  | "NEEDS_PROOF"
  | "READY";

export type TaskCompletionRequirements = {
  noteRequired?: boolean;
  photoRequired?: boolean;
  attachmentRequired?: boolean;
};

export type TaskReadinessInput = {
  status: JobTaskStatus;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: unknown;
  attachments: { id: string }[];
  requiresSignals: string[];
  issues: {
    status: JobIssueStatus;
    severity: JobIssueSeverity;
  }[];
  stage?: {
    requiresSignals: string[];
    issues: {
      status: JobIssueStatus;
      severity: JobIssueSeverity;
    }[];
  } | null;
};

/**
 * Derives the operational state of a task based on its facts, blockers, and signals.
 */
export function deriveTaskState(
  task: TaskReadinessInput,
  liveSignals: string[]
): TaskDerivedState {
  if (task.status === JobTaskStatus.DONE || task.completedAt) {
    return "COMPLETED";
  }

  // 1. Check for blocking issues (Task level)
  const hasTaskBlockingIssue = task.issues.some(
    (i) => i.status === JobIssueStatus.OPEN && i.severity === JobIssueSeverity.BLOCKS_WORK
  );
  if (hasTaskBlockingIssue) {
    return "BLOCKED_BY_ISSUE";
  }

  // 2. Check for blocking issues (Stage level)
  if (task.stage) {
    const hasStageBlockingIssue = task.stage.issues.some(
      (i) => i.status === JobIssueStatus.OPEN && i.severity === JobIssueSeverity.BLOCKS_WORK
    );
    if (hasStageBlockingIssue) {
      return "BLOCKED_BY_ISSUE";
    }
  }

  // 3. Check for missing signals (Stage level)
  if (task.stage && task.stage.requiresSignals.length > 0) {
    const missingStageSignals = task.stage.requiresSignals.filter(
      (s) => !liveSignals.includes(s)
    );
    if (missingStageSignals.length > 0) {
      return "BLOCKED_BY_SIGNAL";
    }
  }

  // 4. Check for missing signals (Task level)
  if (task.requiresSignals.length > 0) {
    const missingTaskSignals = task.requiresSignals.filter(
      (s) => !liveSignals.includes(s)
    );
    if (missingTaskSignals.length > 0) {
      return "BLOCKED_BY_SIGNAL";
    }
  }

  // 5. Check for completion requirements (if unblocked)
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
  
  if (requirements.noteRequired && !task.completionNote) {
    return "NEEDS_PROOF";
  }

  if ((requirements.photoRequired || requirements.attachmentRequired) && task.attachments.length === 0) {
    return "NEEDS_PROOF";
  }

  return "READY";
}

export type StageDerivedState =
  | "COMPLETED"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_SIGNAL"
  | "READY";

export type StageReadinessInput = {
  requiresSignals: string[];
  issues: {
    status: JobIssueStatus;
    severity: JobIssueSeverity;
  }[];
  tasks: TaskReadinessInput[];
};

/**
 * Derives the operational state of a stage.
 */
export function deriveStageState(
  stage: StageReadinessInput,
  liveSignals: string[]
): StageDerivedState {
  // 1. Check if all tasks are completed
  const allTasksCompleted = stage.tasks.length > 0 && stage.tasks.every(
    (t) => t.status === JobTaskStatus.DONE || t.completedAt
  );
  if (allTasksCompleted) {
    return "COMPLETED";
  }

  // 2. Check for blocking issues
  const hasBlockingIssue = stage.issues.some(
    (i) => i.status === JobIssueStatus.OPEN && i.severity === JobIssueSeverity.BLOCKS_WORK
  );
  if (hasBlockingIssue) {
    return "BLOCKED_BY_ISSUE";
  }

  // 3. Check for missing signals
  if (stage.requiresSignals.length > 0) {
    const missingSignals = stage.requiresSignals.filter(
      (s) => !liveSignals.includes(s)
    );
    if (missingSignals.length > 0) {
      return "BLOCKED_BY_SIGNAL";
    }
  }

  return "READY";
}

export function taskStateLabel(state: TaskDerivedState): string {
  switch (state) {
    case "COMPLETED":
      return "Completed";
    case "BLOCKED_BY_ISSUE":
      return "Blocked by issue";
    case "BLOCKED_BY_SIGNAL":
      return "Waiting on signal";
    case "NEEDS_PROOF":
      return "Needs proof";
    case "READY":
      return "Ready";
  }
}

export function taskStateTone(state: TaskDerivedState): "approved" | "danger" | "warning" | "sent" | "neutral" {
  switch (state) {
    case "COMPLETED":
      return "approved";
    case "BLOCKED_BY_ISSUE":
      return "danger";
    case "BLOCKED_BY_SIGNAL":
      return "warning";
    case "NEEDS_PROOF":
      return "warning";
    case "READY":
      return "sent";
  }
}
