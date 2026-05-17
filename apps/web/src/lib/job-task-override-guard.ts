import { JobIssueSeverity, JobIssueStatus, JobTaskStatus } from "@prisma/client";
import type { TaskIssueRef } from "@/lib/task-readiness";

export const OVERRIDE_BLOCKED_BY_ISSUE_MESSAGE =
  "Cannot override while an open blocking issue affects this work. Resolve or force-resolve the issue first.";

export function hasOpenBlocksWorkIssue(issues: TaskIssueRef[]): boolean {
  return issues.some(
    (issue) =>
      issue.status === JobIssueStatus.OPEN &&
      issue.severity === JobIssueSeverity.BLOCKS_WORK,
  );
}

export function getOverrideBlockedByIssueError(params: {
  taskIssues: TaskIssueRef[];
  stageIssues: TaskIssueRef[];
}): string | null {
  if (
    hasOpenBlocksWorkIssue(params.taskIssues) ||
    hasOpenBlocksWorkIssue(params.stageIssues)
  ) {
    return OVERRIDE_BLOCKED_BY_ISSUE_MESSAGE;
  }
  return null;
}

export type OverrideTaskReadinessInput = {
  status: JobTaskStatus;
  issues: TaskIssueRef[];
  jobStage: { issues: TaskIssueRef[] };
};

/**
 * Pure gate used by overrideJobTaskReadinessAction before any DB writes or signals.
 */
export function assertCanOverrideTaskReadiness(
  task: OverrideTaskReadinessInput,
): { ok: true } | { ok: false; error: string } {
  if (task.status === JobTaskStatus.DONE) {
    return { ok: false, error: "Task is already completed." };
  }

  const blockedByIssue = getOverrideBlockedByIssueError({
    taskIssues: task.issues,
    stageIssues: task.jobStage.issues,
  });
  if (blockedByIssue) {
    return { ok: false, error: blockedByIssue };
  }

  return { ok: true };
}
