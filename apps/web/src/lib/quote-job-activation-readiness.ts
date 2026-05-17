import { QuoteStatus } from "@prisma/client";

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
  tasks: QuoteActivationTaskInput[];
};

export type QuoteActivationReadinessInput = {
  status: QuoteStatus;
  lines: QuoteActivationLineInput[];
};

/**
 * Why activation is not currently allowed.
 */
export type QuoteActivationBlockReasonCode =
  | "QUOTE_NOT_APPROVED"
  | "QUOTE_HAS_NO_LINES"
  | "NO_EXECUTION_TASKS"
  | "TASK_MISSING_STAGE"
  | "HARD_SIGNAL_NO_PROVIDER"
  | "CIRCULAR_SIGNAL_DEPENDENCY";

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
  const allProvidedSignals = new Set(allTasks.flatMap((t) => t.providesSignals));
  const hardOrphans: string[] = [];

  for (const task of allTasks) {
    if (task.hardSignal) {
      for (const req of task.requiresSignals) {
        if (!allProvidedSignals.has(req)) {
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
      const providers = signalProviders.get(signal) || [];
      providers.push(task.id);
      signalProviders.set(signal, providers);
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
        const providers = signalProviders.get(req) || [];
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
