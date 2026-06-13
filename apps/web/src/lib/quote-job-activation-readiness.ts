import { PaymentScheduleAnchorType, Prisma, QuoteStatus } from "@prisma/client";
import { validatePaymentScheduleForActivation } from "@/lib/payment-schedule-materialization";
import { normalizeSignalKey, toNormalizedSignalSet } from "@/lib/signal-key";

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

  const allTasks = input.lines.flatMap((l) => l.tasks);
  const totalTasksToActivate = allTasks.length;

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

  const tasksMissingStage = allTasks.filter((t) => !t.stageId);
  if (tasksMissingStage.length > 0) {
    reasons.push({
      code: "TASK_MISSING_STAGE",
      message:
        "Every execution task must have a stage before activation—assign a stage or remove the task.",
      details: tasksMissingStage.map((t) => t.title),
    });
  }

  // 1. Check for Hard Signal Orphans
  const allProvidedSignals = toNormalizedSignalSet(
    allTasks.flatMap((t) => t.providesSignals),
  );
  const hardOrphans: string[] = [];

  for (const task of allTasks) {
    if (task.hardSignal) {
      for (const req of task.requiresSignals) {
        if (!allProvidedSignals.has(normalizeSignalKey(req))) {
          hardOrphans.push(`${task.title} requires hard signal "${req}" but no task provides it.`);
        }
      }
    }
  }

  if (hardOrphans.length > 0) {
    reasons.push({
      code: "HARD_SIGNAL_NO_PROVIDER",
      message: "Some tasks require hard signals that have no provider in this job.",
      details: hardOrphans,
    });
  }

  // 2. Check for Circular Dependencies (Graph-based Cycle Detection)
  const circulars: string[] = [];
  
  // Build a map of signal -> tasks that provide it
  const signalProviders = new Map<string, string[]>();
  for (const task of allTasks) {
    for (const signal of task.providesSignals) {
      const normalizedSignal = normalizeSignalKey(signal);
      const providers = signalProviders.get(normalizedSignal) || [];
      providers.push(task.id);
      signalProviders.set(normalizedSignal, providers);
    }
  }

  // DFS to find cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(taskId: string, path: string[]): boolean {
    if (recStack.has(taskId)) {
      const cyclePath = path.slice(path.indexOf(taskId));
      circulars.push(`Cycle detected: ${cyclePath.join(" -> ")} -> ${taskId}`);
      return true;
    }
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    recStack.add(taskId);

    const task = allTasks.find(t => t.id === taskId);
    if (task) {
      for (const req of task.requiresSignals) {
        const providers = signalProviders.get(normalizeSignalKey(req)) || [];
        for (const providerId of providers) {
          if (hasCycle(providerId, [...path, taskId])) return true;
        }
      }
    }

    recStack.delete(taskId);
    return false;
  }

  for (const task of allTasks) {
    if (!visited.has(task.id)) {
      hasCycle(task.id, []);
    }
  }

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
