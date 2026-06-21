import { PaymentScheduleAnchorType, Prisma, QuoteStatus } from "@prisma/client";
import { validatePaymentScheduleForActivation } from "@/lib/payment-schedule-materialization";
import { analyzeExecutionSignals } from "@/lib/execution-signal-analysis";

/**
 * Plain input for {@link evaluateQuoteJobActivationReadiness}
 */
export type QuoteActivationTaskInput = {
  id: string;
  title: string;
  stageId: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
};

export type QuoteActivationLineInput = {
  id: string;
  description: string;
  executionRelevant?: boolean;
  tasks: QuoteActivationTaskInput[];
};

export type QuoteActivationPaymentScheduleItemInput = {
  id: string;
  title: string;
  anchorType: PaymentScheduleAnchorType;
  amountCents: number | null;
  percentage: Prisma.Decimal | string | null;
};

export type QuoteActivationReadinessInput = {
  status: QuoteStatus;
  /** Whether an APPROVAL checkpoint exists for this quote. */
  hasApprovalCheckpoint: boolean;
  executionPlan?: {
    status: "DRAFT" | "READY_FOR_REVIEW" | "ACCEPTED";
    planVersion: number;
    expectedPlanVersion?: number | null;
    acceptedPlanningInputHash: string | null;
    currentPlanningInputHash: string;
  } | null;
  lines: QuoteActivationLineInput[];
  quoteTotalCents: number;
  paymentSchedule: QuoteActivationPaymentScheduleItemInput[];
};

/**
 * Why activation is not currently allowed.
 */
export type QuoteActivationBlockReasonCode =
  | "QUOTE_NOT_APPROVED"
  | "APPROVAL_CHECKPOINT_MISSING"
  | "QUOTE_HAS_NO_LINES"
  | "NO_EXECUTION_TASKS"
  | "PLAN_NOT_ACCEPTED"
  | "PLAN_STALE"
  | "PLAN_VERSION_MISMATCH"
  | "EXECUTION_SCOPE_NOT_COVERED"
  | "TASK_MISSING_STAGE"
  | "HARD_SIGNAL_NO_PROVIDER"
  | "CIRCULAR_SIGNAL_DEPENDENCY"
  | "PAYMENT_MILESTONE_MISSING_AMOUNT"
  | "PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL"
  | "PAYMENT_MILESTONE_INVALID_PERCENTAGE";

export type QuoteActivationBlockReason = {
  code: QuoteActivationBlockReasonCode;
  message: string;
  /** Tasks or signals that triggered this reason (when applicable). */
  details?: string[];
};

export type QuoteJobActivationReadiness = {
  ready: boolean;
  totalTasksToActivate: number;
  blockReasons: QuoteActivationBlockReason[];
};

/**
 * Decides whether an APPROVED quote can be activated into a job.
 */
export function evaluateQuoteJobActivationReadiness(
  input: QuoteActivationReadinessInput,
): QuoteJobActivationReadiness {
  const reasons: QuoteActivationBlockReason[] = [];

  if (input.status !== QuoteStatus.APPROVED) {
    reasons.push({
      code: "QUOTE_NOT_APPROVED",
      message: "Approve the quote before activation.",
    });
  }

  if (input.status === QuoteStatus.APPROVED && !input.hasApprovalCheckpoint) {
    reasons.push({
      code: "APPROVAL_CHECKPOINT_MISSING",
      message: "Record customer acceptance with an approval checkpoint before activating.",
    });
  }

  if (input.lines.length === 0) {
    reasons.push({
      code: "QUOTE_HAS_NO_LINES",
      message: "This quote has no line items—activation requires at least one scope row.",
    });
  }

  const expandedLineTasks = input.lines.flatMap((line) => line.tasks);
  const uniqueActivationTasks = [
    ...new Map(expandedLineTasks.map((task) => [task.id, task])).values(),
  ];
  const totalTasksToActivate = uniqueActivationTasks.length;

  if (input.lines.length > 0 && totalTasksToActivate === 0) {
    reasons.push({
      code: "NO_EXECUTION_TASKS",
      message: "No execution tasks to activate—add at least one task before activation.",
    });
  }

  if (input.executionPlan && input.executionPlan.status !== "ACCEPTED") {
    reasons.push({
      code: "PLAN_NOT_ACCEPTED",
      message: "Execution plan must be accepted before activation.",
    });
  }
  if (
    input.executionPlan &&
    input.executionPlan.acceptedPlanningInputHash !== input.executionPlan.currentPlanningInputHash
  ) {
    reasons.push({
      code: "PLAN_STALE",
      message: "Execution plan inputs changed. Re-review and accept the latest plan before activation.",
    });
  }
  if (
    input.executionPlan &&
    input.executionPlan.expectedPlanVersion != null &&
    input.executionPlan.expectedPlanVersion !== input.executionPlan.planVersion
  ) {
    reasons.push({
      code: "PLAN_VERSION_MISMATCH",
      message: "Execution plan changed. Refresh and retry activation.",
    });
  }

  const uncoveredExecutionRelevantLines = input.lines
    .filter((line) => line.executionRelevant !== false)
    .filter((line) => line.tasks.length === 0)
    .map((line) => line.description);
  if (uncoveredExecutionRelevantLines.length > 0) {
    reasons.push({
      code: "EXECUTION_SCOPE_NOT_COVERED",
      message:
        "Every execution-relevant line requires at least one planned task before activation.",
      details: uncoveredExecutionRelevantLines,
    });
  }

  const tasksMissingStage = uniqueActivationTasks.filter((task) => !task.stageId);
  if (tasksMissingStage.length > 0) {
    reasons.push({
      code: "TASK_MISSING_STAGE",
      message:
        "Every execution task must have a stage before activation—assign a stage or remove the task.",
      details: tasksMissingStage.map((task) => task.title),
    });
  }

  const signalAnalysis = analyzeExecutionSignals(
    uniqueActivationTasks.map((task) => ({
      id: task.id,
      title: task.title,
      stageId: task.stageId,
      providesSignals: task.providesSignals,
      requiresSignals: task.requiresSignals,
      hardSignal: task.hardSignal,
    })),
  );
  const hardOrphans = signalAnalysis.hardMissingRequirements.map(
    (missing) => `${missing.consumerTaskTitle} requires hard signal "${missing.signal}" but no task provides it.`,
  );

  if (hardOrphans.length > 0) {
    reasons.push({
      code: "HARD_SIGNAL_NO_PROVIDER",
      message: "Some tasks require hard signals that have no provider in this job.",
      details: hardOrphans,
    });
  }

  // 2. Check for Circular Dependencies (Graph-based Cycle Detection)
  const circulars = signalAnalysis.cycles.map(
    (cycle) => `Cycle detected: ${cycle.taskIds.join(" -> ")} -> ${cycle.taskIds[0] ?? ""}`,
  );

  if (circulars.length > 0) {
    reasons.push({
      code: "CIRCULAR_SIGNAL_DEPENDENCY",
      message: "Circular signal dependencies detected.",
      details: circulars,
    });
  }

  const paymentErrors = validatePaymentScheduleForActivation(
    input.paymentSchedule,
    input.quoteTotalCents,
  );
  for (const paymentError of paymentErrors) {
    reasons.push({
      code: paymentError.code,
      message: paymentError.message,
      details: paymentError.details,
    });
  }

  return {
    ready: reasons.length === 0,
    totalTasksToActivate,
    blockReasons: reasons,
  };
}

/** True iff the only blocker is the quote not being APPROVED yet. */
export function quoteActivationOnlyBlockedByApproval(
  readiness: QuoteJobActivationReadiness,
): boolean {
  return (
    readiness.blockReasons.length > 0 &&
    readiness.blockReasons.every((r) => r.code === "QUOTE_NOT_APPROVED")
  );
}
