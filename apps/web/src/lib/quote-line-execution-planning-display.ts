import type {
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
} from "@prisma/client";

/** One calm staff-facing line for quote list / line cards (no enum jargon). */
export function buildQuoteLineExecutionPlanningSummaryLine(params: {
  executionReviewStatus: QuoteLineExecutionReviewStatus;
  executionMergeMode: QuoteLineExecutionMergeMode;
  taskCount: number;
  /** From {@link buildDefaultExecutionSummaryLine} — stage hint when tasks exist. */
  executionSummaryLine: string | null;
  workOrderPosition: number;
  workOrderTotal: number;
}): string {
  if (params.executionReviewStatus === "NO_EXECUTION_NEEDED") {
    return "No execution needed";
  }

  const readiness =
    params.taskCount > 0
      ? `Draft execution · ${params.taskCount} tasks${
          params.executionSummaryLine ? ` · ${params.executionSummaryLine}` : ""
        }`
      : "Needs execution review";

  const staging =
    params.executionMergeMode === "KEEP_SEPARATE_BLOCK"
      ? "Keep this scope separate"
      : "Use shared job stages";

  const orderHint =
    params.workOrderTotal > 1
      ? `Work order ${params.workOrderPosition} of ${params.workOrderTotal}`
      : null;

  return [readiness, staging, orderHint].filter(Boolean).join(" · ");
}
