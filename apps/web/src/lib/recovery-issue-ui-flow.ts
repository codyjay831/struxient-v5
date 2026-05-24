import {
  JobIssueSeverity,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";

export type RecoveryIssueUiFlowIssue = {
  id: string;
  status: JobIssueStatus;
  severity: JobIssueSeverity;
  recoveryFlow?: {
    status: JobRecoveryFlowStatus;
    tasks: { status: JobTaskStatus }[];
  } | null;
};

/** After issue create: auto-open recovery builder only for BLOCKS_WORK with a created issue id. */
export function shouldAutoOpenRecoveryPlanAfterIssueCreate(
  severity: JobIssueSeverity,
  issueId: string | undefined | null,
): boolean {
  return severity === JobIssueSeverity.BLOCKS_WORK && !!issueId;
}

/** Show reopen affordance when issue is open, blocking, and has no recovery flow yet. */
export function shouldShowReviewRecoveryPlanAffordance(params: {
  issue: RecoveryIssueUiFlowIssue;
  showRecoveryBuilder: boolean;
}): boolean {
  if (params.showRecoveryBuilder) return false;
  if (params.issue.status !== JobIssueStatus.OPEN) return false;
  if (params.issue.severity !== JobIssueSeverity.BLOCKS_WORK) return false;
  if (!params.issue.recoveryFlow) return true;
  return params.issue.recoveryFlow.status === JobRecoveryFlowStatus.DRAFT;
}

export function isRecoveryFlowInProgress(
  recoveryFlow: RecoveryIssueUiFlowIssue["recoveryFlow"],
): boolean {
  if (!recoveryFlow) return false;
  return (
    recoveryFlow.status === JobRecoveryFlowStatus.DRAFT ||
    recoveryFlow.status === JobRecoveryFlowStatus.ACTIVE
  );
}

export function allRecoveryTasksDone(
  recoveryFlow: RecoveryIssueUiFlowIssue["recoveryFlow"],
): boolean {
  const tasks = recoveryFlow?.tasks ?? [];
  return tasks.length > 0 && tasks.every((t) => t.status === JobTaskStatus.DONE);
}

/** Resume original path when recovery is complete and issue remains open. */
export function shouldShowResumeOriginalPathAction(
  issue: RecoveryIssueUiFlowIssue,
): boolean {
  if (issue.status !== JobIssueStatus.OPEN) return false;
  const flow = issue.recoveryFlow;
  if (!flow) return false;

  if (flow.status === JobRecoveryFlowStatus.COMPLETED) {
    return true;
  }

  return isRecoveryFlowInProgress(flow) && allRecoveryTasksDone(flow);
}

export function getRecoveryProgressMessage(
  issue: RecoveryIssueUiFlowIssue,
): string | null {
  const flow = issue.recoveryFlow;
  if (!flow) return null;

  const tasks = flow.tasks;
  const total = tasks.length;
  if (total === 0) return null;

  const completed = tasks.filter((t) => t.status === JobTaskStatus.DONE).length;

  if (flow.status === JobRecoveryFlowStatus.COMPLETED) {
    return `Recovery complete (${completed}/${total}). Resume the original path.`;
  }
  if (allRecoveryTasksDone(flow)) {
    return `All follow-up steps done (${completed}/${total}). Resume the original path to clear this blocker.`;
  }
  return `A recovery plan is already in progress (${completed}/${total} steps done).`;
}
