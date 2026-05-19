import {
  JobIssueSeverity,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  buildPaymentDueContextFromJob,
  CORRECTIONS_STAGE_NAME,
  getUnsettledEffectivelyDueRequirements,
  type PaymentDueContext,
  type PaymentRequirementRow,
} from "@/lib/job-payment-readiness";
import {
  deriveTaskState,
  toTaskReadinessInput,
  type TaskDerivedState,
  type TaskIssueRef,
} from "@/lib/task-readiness";

export type ExecutionHealthPrimaryState =
  | "HEALTHY_ACTIONABLE"
  | "COMPLETE"
  | "VALID_WAITING"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_PAYMENT"
  | "BLOCKED_BY_SIGNAL"
  | "RECOVERY_ACTIVE"
  | "RECOVERY_READY_TO_RESUME"
  | "STALE_RECOVERY_FLOW"
  | "BROKEN_REFERENCE"
  | "NO_NEXT_ACTION";

export type ExecutionHealthSeverity = "normal" | "blocker" | "warning";

export type ExecutionHealthWarningCode =
  | "STALE_RECOVERY_FLOW"
  | "BROKEN_RECOVERY_REFERENCE"
  | "ACTIVATION_TASK_MISMATCH"
  | "ORPHAN_SIGNAL"
  | "NO_NEXT_ACTION"
  | "PAYMENT_ATTENTION_ONLY";

export type ExecutionHealthBlocker = {
  kind: "issue" | "payment" | "signal" | "recovery" | "data";
  entityId?: string;
  label: string;
  nextActionLabel: string;
  href?: string;
};

export type ExecutionHealthRecommendedActionType =
  | "complete_task"
  | "resolve_issue"
  | "resume_path"
  | "record_payment"
  | "activate_recovery"
  | "review_health"
  | "none";

export type ExecutionHealthResult = {
  primaryState: ExecutionHealthPrimaryState;
  severity: ExecutionHealthSeverity;
  invariantSatisfied: boolean;
  nextActionableMainTaskId: string | null;
  nextActionableRecoveryTaskId: string | null;
  recommendedNextAction: {
    type: ExecutionHealthRecommendedActionType;
    label: string;
    targetId?: string;
  };
  blockers: ExecutionHealthBlocker[];
  warnings: Array<{ code: ExecutionHealthWarningCode; message: string }>;
  headline: string;
  detail: string;
};

export type JobExecutionContextTask = {
  id: string;
  jobStageId: string;
  stageTitle: string;
  stageSortOrder: number;
  sortOrder: number;
  recoveryFlowOrder: number;
  status: JobTaskStatus;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: unknown;
  attachments: { id: string }[];
  requiresSignals: string[];
  recoveryFlowId: string | null;
  recoveryFlowIssueId: string | null;
  issues: TaskIssueRef[];
  stageIssues: TaskIssueRef[];
};

export type JobExecutionContextIssue = {
  id: string;
  title: string;
  status: JobIssueStatus;
  severity: JobIssueSeverity;
  recoveryFlow: {
    id: string;
    status: JobRecoveryFlowStatus;
    tasks: { id: string; status: JobTaskStatus }[];
  } | null;
};

export type JobExecutionContext = {
  jobId: string;
  jobStatus: JobStatus;
  liveSignals: string[];
  tasks: JobExecutionContextTask[];
  issues: JobExecutionContextIssue[];
  paymentRequirements: PaymentRequirementRow[];
  paymentDueContext: PaymentDueContext;
  effectivelyDuePayments: PaymentRequirementRow[];
};

type AnalyzedTask = JobExecutionContextTask & {
  derivedState: TaskDerivedState;
  isMainPath: boolean;
  isRecovery: boolean;
};

/** Whether Workstation should treat a job as execution-blocked (suppress unscheduled, empty-job badge). */
export function isJobExecutionBlockedForWorkstation(
  health: ExecutionHealthResult,
): boolean {
  return health.severity === "blocker";
}

/** Feature-flagged job detail banner (production off unless EXECUTION_HEALTH_BANNER=1). */
export function isExecutionHealthBannerEnabled(): boolean {
  if (process.env.EXECUTION_HEALTH_BANNER === "1") return true;
  if (process.env.EXECUTION_HEALTH_BANNER === "0") return false;
  return process.env.NODE_ENV === "development";
}

function isRecoveryStageTitle(title: string): boolean {
  return title === CORRECTIONS_STAGE_NAME;
}

function analyzeTasks(ctx: JobExecutionContext): AnalyzedTask[] {
  return ctx.tasks.map((task) => {
    const isRecovery = Boolean(task.recoveryFlowId);
    const isMainPath = !isRecovery && !isRecoveryStageTitle(task.stageTitle);
    const readinessInput = toTaskReadinessInput(task, {
      requiresSignals: [],
      issues: task.stageIssues,
    });
    const derivedState = deriveTaskState(readinessInput, ctx.liveSignals, {
      recoveryFlowIssueId: task.recoveryFlowIssueId,
    });
    return { ...task, derivedState, isMainPath, isRecovery };
  });
}

function sortMainPathTasks(tasks: AnalyzedTask[]): AnalyzedTask[] {
  return tasks
    .filter((t) => t.isMainPath)
    .sort((a, b) => {
      if (a.stageSortOrder !== b.stageSortOrder) {
        return a.stageSortOrder - b.stageSortOrder;
      }
      return a.sortOrder - b.sortOrder;
    });
}

function sortRecoveryTasks(tasks: AnalyzedTask[]): AnalyzedTask[] {
  return tasks
    .filter((t) => t.isRecovery)
    .sort((a, b) => a.recoveryFlowOrder - b.recoveryFlowOrder);
}

function collectStaleWarnings(ctx: JobExecutionContext): ExecutionHealthResult["warnings"] {
  const warnings: ExecutionHealthResult["warnings"] = [];

  for (const issue of ctx.issues) {
    const flow = issue.recoveryFlow;
    if (!flow) continue;

    const flowOpen =
      flow.status === JobRecoveryFlowStatus.DRAFT ||
      flow.status === JobRecoveryFlowStatus.ACTIVE;

    if (issue.status === JobIssueStatus.RESOLVED && flowOpen) {
      warnings.push({
        code: "STALE_RECOVERY_FLOW",
        message: `Issue "${issue.title}" is resolved but its recovery flow is still ${flow.status}.`,
      });
    }

    if (issue.status === JobIssueStatus.OPEN && flow.status === JobRecoveryFlowStatus.COMPLETED) {
      warnings.push({
        code: "STALE_RECOVERY_FLOW",
        message: `Issue "${issue.title}" is open but its recovery flow is marked completed.`,
      });
    }
  }

  if (ctx.effectivelyDuePayments.length > 0) {
    warnings.push({
      code: "PAYMENT_ATTENTION_ONLY",
      message: "Payment is due — record or waive before continuing (completion not blocked yet).",
    });
  }

  return warnings;
}

function hasIncompleteMainWork(mainTasks: AnalyzedTask[]): boolean {
  return mainTasks.some((t) => t.derivedState !== "COMPLETED");
}

function hasIncompleteRecoveryWork(recoveryTasks: AnalyzedTask[]): boolean {
  return recoveryTasks.some((t) => t.derivedState !== "COMPLETED");
}

function hasIncompleteWork(
  mainTasks: AnalyzedTask[],
  recoveryTasks: AnalyzedTask[],
): boolean {
  return hasIncompleteMainWork(mainTasks) || hasIncompleteRecoveryWork(recoveryTasks);
}

function collectBrokenReferenceWarnings(
  ctx: JobExecutionContext,
  analyzed: AnalyzedTask[],
): ExecutionHealthResult["warnings"] {
  const warnings: ExecutionHealthResult["warnings"] = [];
  const knownFlowIds = new Set(
    ctx.issues
      .map((issue) => issue.recoveryFlow?.id)
      .filter((id): id is string => Boolean(id)),
  );

  for (const task of analyzed) {
    if (!task.recoveryFlowId) continue;

    if (!knownFlowIds.has(task.recoveryFlowId)) {
      warnings.push({
        code: "BROKEN_RECOVERY_REFERENCE",
        message: `Recovery task references flow "${task.recoveryFlowId}" that is not linked to a job issue.`,
      });
      continue;
    }

    if (!task.recoveryFlowIssueId) {
      warnings.push({
        code: "BROKEN_RECOVERY_REFERENCE",
        message: "A recovery task is missing its parent issue linkage.",
      });
    }
  }

  return warnings;
}

/**
 * Derives job-level execution health from a pre-built context (pure — use in tests).
 */
export function deriveJobExecutionHealth(ctx: JobExecutionContext): ExecutionHealthResult {
  const analyzed = analyzeTasks(ctx);
  const mainTasks = sortMainPathTasks(analyzed);
  const recoveryTasks = sortRecoveryTasks(analyzed);
  const warnings = [
    ...collectStaleWarnings(ctx),
    ...collectBrokenReferenceWarnings(ctx, analyzed),
  ];

  const nextActionableMainTaskId =
    mainTasks.find((t) => t.derivedState === "READY")?.id ?? null;
  const nextActionableRecoveryTaskId =
    recoveryTasks.find((t) => t.derivedState === "READY")?.id ?? null;

  const openBlockingIssues = ctx.issues.filter(
    (i) => i.status === JobIssueStatus.OPEN && i.severity === JobIssueSeverity.BLOCKS_WORK,
  );

  const blockers: ExecutionHealthBlocker[] = [];

  const incompleteRecovery = hasIncompleteRecoveryWork(recoveryTasks);
  const incompleteWork = hasIncompleteWork(mainTasks, recoveryTasks);
  const allMainComplete =
    mainTasks.length > 0 && mainTasks.every((t) => t.derivedState === "COMPLETED");

  // Recovery-ready: open issue, open flow, all recovery tasks done
  const recoveryReadyIssue = openBlockingIssues.find((issue) => {
    const flow = issue.recoveryFlow;
    if (!flow) return false;
    const flowOpen =
      flow.status === JobRecoveryFlowStatus.DRAFT ||
      flow.status === JobRecoveryFlowStatus.ACTIVE;
    if (!flowOpen) return false;
    if (flow.tasks.length === 0) return false;
    return flow.tasks.every((t) => t.status === JobTaskStatus.DONE);
  });

  if (recoveryReadyIssue) {
    return finalize({
      primaryState: "RECOVERY_READY_TO_RESUME",
      severity: "blocker",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "resume_path",
        label: "Resume original path",
        targetId: recoveryReadyIssue.id,
      },
      blockers: [
        {
          kind: "recovery",
          entityId: recoveryReadyIssue.id,
          label: recoveryReadyIssue.title,
          nextActionLabel: "Resume original path",
        },
      ],
      warnings,
      headline: "Recovery complete",
      detail: "All recovery steps are done. Resume the original path to clear this blocker.",
      incompleteMain: incompleteWork,
    });
  }

  // Active recovery
  const activeRecoveryIssue = openBlockingIssues.find((issue) => {
    const flow = issue.recoveryFlow;
    if (!flow) return false;
    const flowOpen =
      flow.status === JobRecoveryFlowStatus.DRAFT ||
      flow.status === JobRecoveryFlowStatus.ACTIVE;
    if (!flowOpen) return false;
    return flow.tasks.some((t) => t.status !== JobTaskStatus.DONE);
  });

  if (activeRecoveryIssue) {
    const recoveryDetail = nextActionableRecoveryTaskId
      ? "Complete the recovery steps, then resume the original path."
      : "Recovery work remains but no recovery step is ready — resolve other blockers on recovery tasks first.";
    return finalize({
      primaryState: "RECOVERY_ACTIVE",
      severity: nextActionableRecoveryTaskId ? "normal" : "blocker",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: nextActionableRecoveryTaskId
        ? {
            type: "complete_task",
            label: "Continue recovery step",
            targetId: nextActionableRecoveryTaskId,
          }
        : {
            type: "resolve_issue",
            label: "Unblock recovery work",
            targetId: activeRecoveryIssue.id,
          },
      blockers: [
        {
          kind: "recovery",
          entityId: activeRecoveryIssue.id,
          label: activeRecoveryIssue.title,
          nextActionLabel: nextActionableRecoveryTaskId
            ? "Complete recovery steps"
            : "Resolve blockers on recovery tasks",
        },
      ],
      warnings,
      headline: "Recovery in progress",
      detail: recoveryDetail,
      incompleteMain: incompleteWork,
    });
  }

  const brokenReferenceWarning = warnings.some(
    (w) => w.code === "BROKEN_RECOVERY_REFERENCE",
  );
  if (brokenReferenceWarning) {
    return finalize({
      primaryState: "BROKEN_REFERENCE",
      severity: "warning",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "review_health",
        label: "Review execution data",
      },
      blockers: [
        {
          kind: "data",
          label: "Recovery linkage",
          nextActionLabel: "Review recovery task references",
        },
      ],
      warnings,
      headline: "Recovery data needs review",
      detail:
        "One or more recovery tasks reference a flow or issue that cannot be resolved. Review before continuing.",
      incompleteMain: incompleteWork,
    });
  }

  if (ctx.jobStatus === JobStatus.ACTIVE && allMainComplete && !incompleteRecovery) {
    return finalize({
      primaryState: "COMPLETE",
      severity: "normal",
      nextActionableMainTaskId: null,
      nextActionableRecoveryTaskId,
      recommendedNextAction: { type: "none", label: "Review job completion" },
      blockers: [],
      warnings,
      headline: "Main work complete",
      detail: "All main-path tasks are done.",
      incompleteMain: false,
    });
  }

  const staleRecoveryWarning = warnings.some((w) => w.code === "STALE_RECOVERY_FLOW");
  if (staleRecoveryWarning) {
    return finalize({
      primaryState: "STALE_RECOVERY_FLOW",
      severity: "warning",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "review_health",
        label: "Review job setup",
      },
      blockers: [],
      warnings,
      headline: "Recovery status needs review",
      detail: "Issue and recovery flow statuses do not match. Review before continuing.",
      incompleteMain: incompleteWork,
    });
  }

  const paymentBlocksAttention =
    ctx.effectivelyDuePayments.length > 0 && !nextActionableMainTaskId;

  if (paymentBlocksAttention) {
    const pay = ctx.effectivelyDuePayments[0];
    blockers.push({
      kind: "payment",
      entityId: pay?.id,
      label: pay?.title ?? "Payment due",
      nextActionLabel: "Record or waive payment",
    });
    return finalize({
      primaryState: "BLOCKED_BY_PAYMENT",
      severity: "blocker",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "record_payment",
        label: "Record payment",
        targetId: pay?.id,
      },
      blockers,
      warnings,
      headline: "Payment required",
      detail: "A payment is due before work can continue on this job.",
      incompleteMain: incompleteWork,
    });
  }

  const incompleteMainTasks = mainTasks.filter((t) => t.derivedState !== "COMPLETED");
  const allMainBlockedByIssue =
    incompleteMainTasks.length > 0 &&
    incompleteMainTasks.every((t) => t.derivedState === "BLOCKED_BY_ISSUE");

  if (allMainBlockedByIssue && openBlockingIssues.length > 0) {
    const issue = openBlockingIssues[0];
    blockers.push({
      kind: "issue",
      entityId: issue.id,
      label: issue.title,
      nextActionLabel: "Resolve issue or complete recovery",
    });
    return finalize({
      primaryState: "BLOCKED_BY_ISSUE",
      severity: "blocker",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "resolve_issue",
        label: "Resolve blocking issue",
        targetId: issue.id,
      },
      blockers,
      warnings,
      headline: "Work paused",
      detail: "An open issue is blocking execution on this job.",
      incompleteMain: incompleteWork,
    });
  }

  const allMainBlockedBySignal =
    incompleteMainTasks.length > 0 &&
    incompleteMainTasks.every((t) => t.derivedState === "BLOCKED_BY_SIGNAL");

  if (allMainBlockedBySignal) {
    return finalize({
      primaryState: "BLOCKED_BY_SIGNAL",
      severity: "normal",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: { type: "none", label: "Wait for prerequisites" },
      blockers: [
        {
          kind: "signal",
          label: "Waiting on prior work",
          nextActionLabel: "Complete prerequisite tasks",
        },
      ],
      warnings,
      headline: "Waiting on prior work",
      detail: "Tasks are waiting for signals from earlier steps.",
      incompleteMain: incompleteWork,
    });
  }

  if (nextActionableMainTaskId || nextActionableRecoveryTaskId) {
    const targetId = nextActionableRecoveryTaskId ?? nextActionableMainTaskId;
    return finalize({
      primaryState: "HEALTHY_ACTIONABLE",
      severity: "normal",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "complete_task",
        label: "Continue work",
        targetId: targetId ?? undefined,
      },
      blockers: [],
      warnings,
      headline: "Ready to work",
      detail: "At least one task is ready to complete.",
      incompleteMain: incompleteWork,
    });
  }

  if (incompleteWork) {
    warnings.push({
      code: "NO_NEXT_ACTION",
      message: "Incomplete work exists but no actionable task or clear blocker was identified.",
    });
    return finalize({
      primaryState: "NO_NEXT_ACTION",
      severity: "warning",
      nextActionableMainTaskId,
      nextActionableRecoveryTaskId,
      recommendedNextAction: {
        type: "review_health",
        label: "Review job setup",
      },
      blockers: [],
      warnings,
      headline: "Needs setup review",
      detail: "No next action is ready. Review blockers, schedule, or task setup.",
      incompleteMain: incompleteWork,
    });
  }

  return finalize({
    primaryState: "VALID_WAITING",
    severity: "normal",
    nextActionableMainTaskId,
    nextActionableRecoveryTaskId,
    recommendedNextAction: { type: "none", label: "No action needed" },
    blockers: [],
    warnings,
    headline: "No action needed",
    detail: "No incomplete work requires attention.",
    incompleteMain: incompleteWork,
  });
}

type FinalizeInput = Omit<ExecutionHealthResult, "invariantSatisfied"> & {
  incompleteMain: boolean;
};

function finalize(input: FinalizeInput): ExecutionHealthResult {
  const hasExplainableState =
    input.primaryState !== "NO_NEXT_ACTION" ||
    input.warnings.length > 0 ||
    input.blockers.length > 0;

  const invariantSatisfied =
    !input.incompleteMain ||
    Boolean(input.nextActionableMainTaskId) ||
    Boolean(input.nextActionableRecoveryTaskId) ||
    input.blockers.length > 0 ||
    hasExplainableState;

  return {
    ...input,
    invariantSatisfied,
  };
}

export type BuildJobExecutionContextJobInput = {
  id: string;
  status: JobStatus;
  stages: Array<{
    id: string;
    title: string;
    sortOrder: number;
    stageId: string | null;
    issues: TaskIssueRef[];
    tasks: Array<{
      id: string;
      jobStageId?: string;
      status: JobTaskStatus;
      completedAt: Date | null;
      completionNote: string | null;
      completionRequirementsJson: unknown;
      attachments: { id: string }[];
      requiresSignals: string[];
      recoveryFlowId: string | null;
      recoveryFlowOrder?: number;
      sortOrder: number;
      issues: TaskIssueRef[];
      recoveryFlow?: { jobIssueId: string } | null;
    }>;
  }>;
  issues: JobExecutionContextIssue[];
  paymentRequirements: Array<{
    id: string;
    title: string;
    status: PaymentRequirementRow["status"];
    requiredBeforeStageId: string | null;
    sourcePaymentScheduleItemId: string | null;
    sourcePaymentScheduleItem?: PaymentRequirementRow["sourcePaymentScheduleItem"];
  }>;
};

/**
 * Builds execution context from a job payload (same shape as job detail / workstation).
 */
export function buildJobExecutionContextFromJob(
  job: BuildJobExecutionContextJobInput,
  liveSignals: string[],
): JobExecutionContext {
  const paymentRequirements = job.paymentRequirements as PaymentRequirementRow[];
  const paymentDueContext = buildPaymentDueContextFromJob({
    status: job.status,
    stages: job.stages.map((s) => ({
      id: s.id,
      sortOrder: s.sortOrder,
      stageId: s.stageId,
      title: s.title,
      tasks: s.tasks.map((t) => ({
        status: t.status,
        recoveryFlowId: t.recoveryFlowId,
      })),
    })),
    paymentRequirements,
  });
  const effectivelyDuePayments = getUnsettledEffectivelyDueRequirements(
    paymentRequirements,
    paymentDueContext,
  );

  const tasks: JobExecutionContextTask[] = [];
  for (const stage of job.stages) {
    for (const task of stage.tasks) {
      tasks.push({
        id: task.id,
        jobStageId: stage.id,
        stageTitle: stage.title,
        stageSortOrder: stage.sortOrder,
        sortOrder: task.sortOrder,
        recoveryFlowOrder: task.recoveryFlowOrder ?? 0,
        status: task.status,
        completedAt: task.completedAt,
        completionNote: task.completionNote,
        completionRequirementsJson: task.completionRequirementsJson,
        attachments: task.attachments,
        requiresSignals: task.requiresSignals,
        recoveryFlowId: task.recoveryFlowId,
        recoveryFlowIssueId: task.recoveryFlow?.jobIssueId ?? null,
        issues: task.issues,
        stageIssues: stage.issues,
      });
    }
  }

  return {
    jobId: job.id,
    jobStatus: job.status,
    liveSignals,
    tasks,
    issues: job.issues,
    paymentRequirements,
    paymentDueContext,
    effectivelyDuePayments,
  };
}
