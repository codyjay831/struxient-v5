import { JobIssueStatus, JobIssueSeverity, JobTaskStatus } from "@prisma/client";

export type TaskDerivedState =
  | "COMPLETED"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_SIGNAL"
  | "NEEDS_PROOF"
  | "READY";

export type ChecklistItem = {
  id: string;
  label: string;
  completedAt?: string | null; // ISO string for JSON compatibility
  completedByUserId?: string | null;
};

export type TaskCompletionRequirements = {
  noteRequired?: boolean;
  photoRequired?: boolean;
  attachmentRequired?: boolean;
  checklist?: ChecklistItem[];
};

export type TaskIssueRef = {
  id: string;
  status: JobIssueStatus;
  severity: JobIssueSeverity;
};

export type TaskStageContext = {
  requiresSignals: string[];
  issues: TaskIssueRef[];
};

export type TaskReadinessInput = {
  status: JobTaskStatus;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: unknown;
  attachments: { id: string }[];
  requiresSignals: string[];
  recoveryFlowId?: string | null;
  issues: TaskIssueRef[];
  stage?: TaskStageContext | null;
};

/** Minimal task fields accepted from Prisma includes or flat UI payloads. */
export type TaskReadinessSource = {
  status: JobTaskStatus;
  completedAt?: Date | null;
  completionNote?: string | null;
  completionRequirementsJson?: unknown;
  attachments?: { id: string }[];
  requiresSignals?: string[];
  recoveryFlowId?: string | null;
  issues?: TaskIssueRef[];
  /** Prisma relation name — stage context is usually passed via the second argument. */
  jobStage?: {
    requiresSignals?: string[];
    issues?: TaskIssueRef[];
  };
};

/**
 * Maps Prisma task rows or UI payloads into the canonical shape for deriveTaskState.
 */
export function toTaskReadinessInput(
  task: TaskReadinessSource,
  stageContext: TaskStageContext,
): TaskReadinessInput {
  return {
    status: task.status,
    completedAt: task.completedAt ?? null,
    completionNote: task.completionNote ?? null,
    completionRequirementsJson: task.completionRequirementsJson ?? {},
    attachments: task.attachments ?? [],
    requiresSignals: task.requiresSignals ?? [],
    recoveryFlowId: task.recoveryFlowId ?? null,
    issues: task.issues ?? [],
    stage: {
      requiresSignals: [],
      issues: stageContext.issues ?? task.jobStage?.issues ?? [],
    },
  };
}

/**
 * Derives the operational state of a task based on its facts, blockers, and signals.
 */
export function deriveTaskState(
  task: TaskReadinessInput,
  liveSignals: string[],
  options?: {
    recoveryFlowIssueId?: string | null;
  }
): TaskDerivedState {
  if (task.status === JobTaskStatus.DONE || task.completedAt) {
    return "COMPLETED";
  }

  // 1. Check for blocking issues (Task level)
  const hasTaskBlockingIssue = task.issues.some((i) => {
    if (i.status !== JobIssueStatus.OPEN || i.severity !== JobIssueSeverity.BLOCKS_WORK) {
      return false;
    }
    // Bypass if this task is part of a recovery flow meant to fix this specific issue
    if (options?.recoveryFlowIssueId === i.id) {
      return false;
    }
    return true;
  });

  if (hasTaskBlockingIssue) {
    return "BLOCKED_BY_ISSUE";
  }

  // 2. Check for blocking issues (Stage level)
  if (task.stage) {
    const hasStageBlockingIssue = task.stage.issues.some((i) => {
      if (i.status !== JobIssueStatus.OPEN || i.severity !== JobIssueSeverity.BLOCKS_WORK) {
        return false;
      }
      // Bypass if this task is part of a recovery flow meant to fix this specific issue
      if (options?.recoveryFlowIssueId === i.id) {
        return false;
      }
      return true;
    });

    if (hasStageBlockingIssue) {
      return "BLOCKED_BY_ISSUE";
    }
  }

  // 3. Check for missing signals (Task level)
  if (task.requiresSignals.length > 0) {
    const missingTaskSignals = task.requiresSignals.filter(
      (s) => !liveSignals.includes(s)
    );
    if (missingTaskSignals.length > 0) {
      return "BLOCKED_BY_SIGNAL";
    }
  }

  // 4. Check for completion requirements (if unblocked)
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
  
  if (requirements.noteRequired && !task.completionNote) {
    return "NEEDS_PROOF";
  }

  if ((requirements.photoRequired || requirements.attachmentRequired) && task.attachments.length === 0) {
    return "NEEDS_PROOF";
  }

  if (requirements.checklist && requirements.checklist.length > 0) {
    const allChecked = requirements.checklist.every((item) => !!item.completedAt);
    if (!allChecked) {
      return "NEEDS_PROOF";
    }
  }

  return "READY";
}

export type TaskCompletionValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates that stored facts satisfy completion requirements aligned with deriveTaskState.
 * Use in completeJobTaskAction after issue/signal gates pass.
 */
export function validateTaskCompletionReadiness(
  task: Pick<
    TaskReadinessInput,
    "completionNote" | "completionRequirementsJson" | "attachments"
  >,
): TaskCompletionValidationResult {
  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};

  if (requirements.noteRequired && !task.completionNote?.trim()) {
    return { ok: false, error: "A completion note is required for this task." };
  }

  if (
    (requirements.photoRequired || requirements.attachmentRequired) &&
    task.attachments.length === 0
  ) {
    return { ok: false, error: "Photo or attachment proof is required for this task." };
  }

  if (requirements.checklist && requirements.checklist.length > 0) {
    const allChecked = requirements.checklist.every((item) => !!item.completedAt);
    if (!allChecked) {
      return { ok: false, error: "Complete all checklist items before finishing this task." };
    }
  }

  return { ok: true };
}

export type StageDerivedState =
  | "COMPLETED"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_SIGNAL"
  | "READY";

export type StageReadinessInput = {
  requiresSignals: string[];
  issues: {
    id: string;
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
  _liveSignals: string[],
  options?: {
    recoveryFlowIssueId?: string | null;
  }
): StageDerivedState {
  // 1. Check if all tasks are completed
  const allTasksCompleted = stage.tasks.length > 0 && stage.tasks.every(
    (t) => t.status === JobTaskStatus.DONE || t.completedAt
  );
  if (allTasksCompleted) {
    return "COMPLETED";
  }

  // 2. Check for blocking issues
  const hasBlockingIssue = stage.issues.some((i) => {
    if (i.status !== JobIssueStatus.OPEN || i.severity !== JobIssueSeverity.BLOCKS_WORK) {
      return false;
    }
    if (options?.recoveryFlowIssueId === i.id) {
      return false;
    }
    return true;
  });
  if (hasBlockingIssue) {
    return "BLOCKED_BY_ISSUE";
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
