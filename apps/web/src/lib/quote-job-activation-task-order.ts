export type ActivationTaskOrderInput = {
  id: string;
  stageId: string | null;
  /** QuoteLineExecutionTask.sortOrder (scoped per line item). */
  sortOrder: number;
  lineId: string;
  /** QuoteLineItem.sortOrder */
  lineSortOrder: number;
};

export type ActivationTaskWithJobSortOrder<T extends ActivationTaskOrderInput> = T & {
  jobTaskSortOrder: number;
};

/**
 * Deterministic per-JobStage sort order for materialized JobTask rows at activation.
 *
 * Tuple: line sort -> line id -> draft task sort -> draft task id.
 * Output sortOrder is unique within each stageId bucket (0..n-1).
 */
export function assignJobTaskSortOrdersAtActivation<T extends ActivationTaskOrderInput>(
  tasks: T[],
): ActivationTaskWithJobSortOrder<T>[] {
  const sorted = [...tasks].sort((a, b) => {
    const stageA = a.stageId ?? "";
    const stageB = b.stageId ?? "";
    if (stageA !== stageB) return stageA.localeCompare(stageB);
    if (a.lineSortOrder !== b.lineSortOrder) return a.lineSortOrder - b.lineSortOrder;
    if (a.lineId !== b.lineId) return a.lineId.localeCompare(b.lineId);
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id.localeCompare(b.id);
  });

  const stageCounters = new Map<string, number>();

  return sorted.map((task) => {
    const stageKey = task.stageId ?? "";
    const next = stageCounters.get(stageKey) ?? 0;
    stageCounters.set(stageKey, next + 1);
    return { ...task, jobTaskSortOrder: next };
  });
}

export type ActivationLineItemForTaskOrder = {
  id: string;
  sortOrder: number;
  draftExecutionTasks: Array<{
    id: string;
    stageId: string | null;
    sortOrder: number;
  }>;
};

/** Map QuoteLineExecutionTask.id -> normalized JobTask.sortOrder for activation. */
export function buildJobTaskSortOrderMap(
  lineItems: ActivationLineItemForTaskOrder[],
): Map<string, number> {
  const inputs: ActivationTaskOrderInput[] = lineItems.flatMap((line) =>
    line.draftExecutionTasks.map((task) => ({
      id: task.id,
      stageId: task.stageId,
      sortOrder: task.sortOrder,
      lineId: line.id,
      lineSortOrder: line.sortOrder,
    })),
  );

  return new Map(
    assignJobTaskSortOrdersAtActivation(inputs).map((task) => [
      task.id,
      task.jobTaskSortOrder,
    ]),
  );
}
