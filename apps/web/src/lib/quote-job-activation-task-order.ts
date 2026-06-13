export type ActivationTaskOrderInput = {
  id: string;
  stageId: string | null;
  /** QuoteExecutionTask.sortOrder (plan-wide canonical ordering). */
  sortOrder: number;
};

export type ActivationTaskWithJobSortOrder<T extends ActivationTaskOrderInput> = T & {
  jobTaskSortOrder: number;
};

/**
 * Deterministic per-JobStage sort order for materialized JobTask rows at activation.
 *
 * Tuple: plan sort -> task id.
 * Output sortOrder is unique within each stageId bucket (0..n-1).
 */
export function assignJobTaskSortOrdersAtActivation<T extends ActivationTaskOrderInput>(
  tasks: T[],
): ActivationTaskWithJobSortOrder<T>[] {
  const sorted = [...tasks].sort((a, b) => {
    const stageA = a.stageId ?? "";
    const stageB = b.stageId ?? "";
    if (stageA !== stageB) return stageA.localeCompare(stageB);
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
    })),
  );

  return new Map(
    assignJobTaskSortOrdersAtActivation(inputs).map((task) => [
      task.id,
      task.jobTaskSortOrder,
    ]),
  );
}

export type ActivationQuotePlanTaskOrderInput = {
  id: string;
  stageId: string | null;
  sortOrder: number;
  sourceQuoteLineExecutionTaskId: string | null;
};

/** Map QuoteLineExecutionTask.id -> JobTask.sortOrder using quote-plan-wide ordering. */
export function buildJobTaskSortOrderMapFromQuotePlanTasks(
  planTasks: ActivationQuotePlanTaskOrderInput[],
): Map<string, number> {
  const sourceByPlanTaskId = new Map<string, string>();
  for (const task of planTasks) {
    if (task.sourceQuoteLineExecutionTaskId) {
      sourceByPlanTaskId.set(task.id, task.sourceQuoteLineExecutionTaskId);
    }
  }
  const ordered = assignJobTaskSortOrdersAtActivation(
    planTasks
      .filter((task) => task.sourceQuoteLineExecutionTaskId != null)
      .map((task) => ({
        id: task.id,
        stageId: task.stageId,
        sortOrder: task.sortOrder,
      })),
  );
  const taskOrderBySourceId = new Map<string, number>();
  for (const task of ordered) {
    const sourceId = sourceByPlanTaskId.get(task.id);
    if (sourceId) {
      taskOrderBySourceId.set(sourceId, task.jobTaskSortOrder);
    }
  }
  return taskOrderBySourceId;
}
