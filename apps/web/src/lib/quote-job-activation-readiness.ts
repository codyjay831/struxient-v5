import {
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
  QuoteStatus,
} from "@prisma/client";

/**
 * Plain input for {@link evaluateQuoteJobActivationReadiness} — same shape pattern as
 * the execution-review preview model so server actions and the preview view can share inputs.
 */
export type QuoteActivationLineInput = {
  id: string;
  description: string;
  executionReviewStatus: QuoteLineExecutionReviewStatus;
  executionMergeMode: QuoteLineExecutionMergeMode;
  taskCount: number;
};

export type QuoteActivationReadinessInput = {
  status: QuoteStatus;
  lines: QuoteActivationLineInput[];
};

/**
 * Why activation is not currently allowed (machine-readable; UI maps to copy).
 * Order matters — the first matching reason should be presented.
 */
export type QuoteActivationBlockReasonCode =
  | "QUOTE_NOT_APPROVED"
  | "QUOTE_HAS_NO_LINES"
  | "LINE_NEEDS_EXECUTION_REVIEW"
  | "LINE_COMMERCIAL_ONLY_HAS_TASKS"
  | "NO_EXECUTION_TASKS";

export type QuoteActivationBlockReason = {
  code: QuoteActivationBlockReasonCode;
  message: string;
  /** Lines that triggered this reason (when applicable). */
  lines: { id: string; description: string }[];
};

export type QuoteJobActivationReadiness = {
  ready: boolean;
  totalTasksToActivate: number;
  sharedTaskCount: number;
  separateBlockCount: number;
  separateBlockTaskCount: number;
  blockReasons: QuoteActivationBlockReason[];
};

/**
 * Decides whether an APPROVED quote can be activated into a job.
 * Pure / deterministic — server action calls this inside the activation transaction
 * and the preview view calls it for read-only "Activate job" gating.
 */
export function evaluateQuoteJobActivationReadiness(
  input: QuoteActivationReadinessInput,
): QuoteJobActivationReadiness {
  const reasons: QuoteActivationBlockReason[] = [];

  if (input.status !== QuoteStatus.APPROVED) {
    reasons.push({
      code: "QUOTE_NOT_APPROVED",
      message: "Approve the quote before activation.",
      lines: [],
    });
  }

  if (input.lines.length === 0) {
    reasons.push({
      code: "QUOTE_HAS_NO_LINES",
      message: "This quote has no line items—activation requires at least one scope row.",
      lines: [],
    });
  }

  const needsReviewLines = input.lines.filter(
    (l) =>
      l.executionReviewStatus === QuoteLineExecutionReviewStatus.UNREVIEWED &&
      l.taskCount === 0,
  );
  if (needsReviewLines.length > 0) {
    reasons.push({
      code: "LINE_NEEDS_EXECUTION_REVIEW",
      message:
        "Some lines still need an execution decision—add tasks or mark the line no execution needed before activation.",
      lines: needsReviewLines.map((l) => ({ id: l.id, description: l.description })),
    });
  }

  const anomalyLines = input.lines.filter(
    (l) =>
      l.executionReviewStatus === QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED &&
      l.taskCount > 0,
  );
  if (anomalyLines.length > 0) {
    reasons.push({
      code: "LINE_COMMERCIAL_ONLY_HAS_TASKS",
      message:
        "Some lines are marked no execution needed but still have draft tasks—fix planning on those lines first.",
      lines: anomalyLines.map((l) => ({ id: l.id, description: l.description })),
    });
  }

  const sharedTaskCount = input.lines.reduce(
    (sum, l) =>
      l.executionReviewStatus !== QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED &&
      l.executionMergeMode === QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES
        ? sum + l.taskCount
        : sum,
    0,
  );
  const separateContributingLines = input.lines.filter(
    (l) =>
      l.executionReviewStatus !== QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED &&
      l.executionMergeMode === QuoteLineExecutionMergeMode.KEEP_SEPARATE_BLOCK &&
      l.taskCount > 0,
  );
  const separateBlockTaskCount = separateContributingLines.reduce(
    (sum, l) => sum + l.taskCount,
    0,
  );
  const totalTasksToActivate = sharedTaskCount + separateBlockTaskCount;

  if (
    reasons.length === 0 &&
    input.lines.length > 0 &&
    totalTasksToActivate === 0
  ) {
    reasons.push({
      code: "NO_EXECUTION_TASKS",
      message:
        "No execution tasks to activate—mark at least one line for execution work before activation.",
      lines: [],
    });
  }

  return {
    ready: reasons.length === 0,
    totalTasksToActivate,
    sharedTaskCount,
    separateBlockCount: separateContributingLines.length,
    separateBlockTaskCount,
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
