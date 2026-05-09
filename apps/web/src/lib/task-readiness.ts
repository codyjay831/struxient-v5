import { JobTaskStatus, JobIssueStatus, JobIssueSeverity, JobPaymentRequirementStatus } from "@prisma/client";

export type TaskDerivedState =
  | "COMPLETED"
  | "BLOCKED"
  | "NEEDS_PROOF"
  | "READY_TO_COMPLETE";

export type TaskCompletionRequirements = {
  noteRequired?: boolean;
  photoRequired?: boolean;
  attachmentRequired?: boolean;
};

export type TaskReadinessInput = {
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: any;
  attachments: { id: string }[];
  issues: {
    status: JobIssueStatus;
    severity: JobIssueSeverity;
  }[];
  paymentBlockers: {
    status: JobPaymentRequirementStatus;
    title: string;
  }[];
};

/**
 * Derives the operational state of a task based on its facts, blockers, and requirements.
 * Users do not manually set these states; they are an explanation of reality.
 */
export function deriveTaskState(task: TaskReadinessInput): TaskDerivedState {
  if (task.completedAt) {
    return "COMPLETED";
  }

  const isIssueBlocked = task.issues.some(
    (i) => i.status === JobIssueStatus.OPEN && i.severity === JobIssueSeverity.BLOCKS_WORK
  );

  const isPaymentBlocked = task.paymentBlockers.some(
    (p) => p.status === JobPaymentRequirementStatus.DUE
  );

  if (isIssueBlocked || isPaymentBlocked) {
    return "BLOCKED";
  }

  const requirements = (task.completionRequirementsJson as TaskCompletionRequirements) || {};
  
  if (requirements.noteRequired && !task.completionNote) {
    return "NEEDS_PROOF";
  }

  if ((requirements.photoRequired || requirements.attachmentRequired) && task.attachments.length === 0) {
    return "NEEDS_PROOF";
  }

  return "READY_TO_COMPLETE";
}

export function taskStateLabel(state: TaskDerivedState, input?: TaskReadinessInput): string {
  switch (state) {
    case "COMPLETED":
      return "Completed";
    case "BLOCKED":
      if (input?.paymentBlockers.some(p => p.status === JobPaymentRequirementStatus.DUE)) {
        return "Payment required";
      }
      return "Blocked";
    case "NEEDS_PROOF":
      return "Needs proof";
    case "READY_TO_COMPLETE":
      return "Ready to complete";
  }
}

export function taskStateTone(state: TaskDerivedState): "approved" | "danger" | "warning" | "sent" | "neutral" {
  switch (state) {
    case "COMPLETED":
      return "approved";
    case "BLOCKED":
      return "danger";
    case "NEEDS_PROOF":
      return "warning";
    case "READY_TO_COMPLETE":
      return "sent";
  }
}
