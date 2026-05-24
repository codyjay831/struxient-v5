import {
  JobIssueSeverity,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import type { ExecutionHealthRecommendedActionType } from "@/lib/job-execution-health";
import {
  allRecoveryTasksDone,
  shouldShowResumeOriginalPathAction,
  type RecoveryIssueUiFlowIssue,
} from "@/lib/recovery-issue-ui-flow";

export type WorkstationRecoveryActionKind =
  | "plan-recovery"
  | "do-recovery-task"
  | "resume-original-path";

export type WorkstationRecoveryRoute = {
  actionKind: WorkstationRecoveryActionKind;
  actionLabel: string;
  nextStep: string;
  actionIssueId?: string;
  actionTaskId?: string;
};

export type IssueRecoveryRouteInput = RecoveryIssueUiFlowIssue & {
  id: string;
  recoveryFlow?: {
    status: JobRecoveryFlowStatus;
    tasks: {
      id: string;
      title: string;
      status: JobTaskStatus;
      recoveryFlowOrder: number;
    }[];
  } | null;
};

export type BlockingIssueCandidate = {
  id: string;
  jobTaskId: string | null;
  jobStageId: string | null;
  createdAt: Date;
  status: JobIssueStatus;
  severity: JobIssueSeverity;
  recoveryFlow?: IssueRecoveryRouteInput["recoveryFlow"];
};

type RecommendedNextAction = {
  type: ExecutionHealthRecommendedActionType;
  label: string;
  targetId?: string;
};

/** Maps execution-health recommended actions to Workstation panel routes (adapter only). */
export function mapHealthActionToWorkstationRoute(
  action: RecommendedNextAction,
  fallbackIssueId?: string,
): WorkstationRecoveryRoute | null {
  switch (action.type) {
    case "complete_task": {
      if (!action.targetId) return null;
      return {
        actionKind: "do-recovery-task",
        actionTaskId: action.targetId,
        actionIssueId: fallbackIssueId,
        actionLabel: action.label,
        nextStep: action.label,
      };
    }
    case "resume_path": {
      const issueId = action.targetId ?? fallbackIssueId;
      if (!issueId) return null;
      return {
        actionKind: "resume-original-path",
        actionIssueId: issueId,
        actionLabel: action.label,
        nextStep: action.label,
      };
    }
    case "activate_recovery":
    case "resolve_issue": {
      const issueId = action.targetId ?? fallbackIssueId;
      if (!issueId) return null;
      return {
        actionKind: "plan-recovery",
        actionIssueId: issueId,
        actionLabel: action.label,
        nextStep: action.label,
      };
    }
    default:
      return null;
  }
}

function sortRecoveryTasks<T extends { recoveryFlowOrder: number; sortOrder?: number }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    if (a.recoveryFlowOrder !== b.recoveryFlowOrder) {
      return a.recoveryFlowOrder - b.recoveryFlowOrder;
    }
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

function findNextRecoveryTaskId(
  flow: NonNullable<IssueRecoveryRouteInput["recoveryFlow"]>,
): { taskId: string; title: string; stepIndex: number; total: number } | null {
  const ordered = sortRecoveryTasks(flow.tasks);
  const total = ordered.length;
  const completed = ordered.filter((t) => t.status === JobTaskStatus.DONE).length;
  const next = ordered.find((t) => t.status !== JobTaskStatus.DONE);
  if (!next) return null;
  return {
    taskId: next.id,
    title: next.title,
    stepIndex: completed + 1,
    total,
  };
}

/** Issue-queue routing — predicates aligned with recovery-issue-ui-flow + health outcomes. */
export function deriveIssueRecoveryRoute(
  issue: IssueRecoveryRouteInput,
): WorkstationRecoveryRoute {
  const flow = issue.recoveryFlow;

  if (
    !flow ||
    flow.status === JobRecoveryFlowStatus.CANCELLED ||
    flow.status === JobRecoveryFlowStatus.DRAFT
  ) {
    return {
      actionKind: "plan-recovery",
      actionIssueId: issue.id,
      actionLabel: flow?.status === JobRecoveryFlowStatus.DRAFT
        ? "Review recovery plan"
        : "Plan recovery",
      nextStep: flow?.status === JobRecoveryFlowStatus.DRAFT
        ? "Draft recovery plan needs review/activation."
        : "Review and plan recovery for this issue.",
    };
  }

  if (shouldShowResumeOriginalPathAction(issue)) {
    const total = flow.tasks.length;
    const completed = flow.tasks.filter((t) => t.status === JobTaskStatus.DONE).length;
    return {
      actionKind: "resume-original-path",
      actionIssueId: issue.id,
      actionLabel: "Resume original path",
      nextStep:
        total > 0
          ? `Recovery complete (${completed}/${total}). Resume the original path.`
          : "Recovery complete. Resume original path.",
    };
  }

  if (
    flow.status === JobRecoveryFlowStatus.ACTIVE &&
    !allRecoveryTasksDone(flow)
  ) {
    const next = findNextRecoveryTaskId(flow);
    if (next) {
      return {
        actionKind: "do-recovery-task",
        actionIssueId: issue.id,
        actionTaskId: next.taskId,
        actionLabel: "Continue recovery step",
        nextStep: `Recovery Step ${next.stepIndex}/${next.total}: ${next.title}`,
      };
    }
  }

  return {
    actionKind: "plan-recovery",
    actionIssueId: issue.id,
    actionLabel: "Plan recovery",
    nextStep: "Review and plan recovery for this issue.",
  };
}

function oldestFirst<T extends { createdAt: Date }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** Task-scoped issue → stage-scoped → oldest open blocker on job. */
export function pickBlockingIssueForTask(
  taskId: string,
  jobStageId: string,
  candidates: BlockingIssueCandidate[],
): BlockingIssueCandidate | null {
  const blocking = candidates.filter(
    (c) =>
      c.status === JobIssueStatus.OPEN &&
      c.severity === JobIssueSeverity.BLOCKS_WORK,
  );
  if (blocking.length === 0) return null;

  const onTask = oldestFirst(blocking.filter((c) => c.jobTaskId === taskId));
  if (onTask.length > 0) return onTask[0]!;

  const onStage = oldestFirst(
    blocking.filter((c) => c.jobStageId === jobStageId && c.jobTaskId == null),
  );
  if (onStage.length > 0) return onStage[0]!;

  return oldestFirst(blocking)[0] ?? null;
}

/** Blocked main-path task → Option A route (plan or active recovery step). */
export function deriveBlockedTaskRecoveryRoute(
  taskId: string,
  jobStageId: string,
  candidates: BlockingIssueCandidate[],
): WorkstationRecoveryRoute | null {
  const issue = pickBlockingIssueForTask(taskId, jobStageId, candidates);
  if (!issue) return null;

  const route = deriveIssueRecoveryRoute({
    id: issue.id,
    status: issue.status,
    severity: issue.severity,
    recoveryFlow: issue.recoveryFlow,
  });

  return route;
}

/** Recovery-related health action types that warrant WS action fields on job-health items. */
export function isRecoveryRelatedHealthAction(
  type: ExecutionHealthRecommendedActionType,
): boolean {
  return (
    type === "complete_task" ||
    type === "resume_path" ||
    type === "activate_recovery" ||
    type === "resolve_issue"
  );
}
