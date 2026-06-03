/** One calm staff-facing line for quote list / line cards (no enum jargon). */
export function buildQuoteLineExecutionPlanningSummaryLine(params: {
  taskCount: number;
  /** From {@link buildDefaultExecutionSummaryLine} — stage hint when tasks exist. */
  executionSummaryLine: string | null;
}): string {
  if (params.taskCount === 0) {
    return "Needs job plan review";
  }

  if (params.executionSummaryLine) {
    return `Planned work · ${params.executionSummaryLine}`;
  }

  const taskWord = params.taskCount === 1 ? "task" : "tasks";
  return `Planned work · ${params.taskCount} ${taskWord}`;
}
