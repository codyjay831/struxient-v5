import { JobTaskStatus } from "@prisma/client";

export const REVERT_ONLY_FROM_DONE_MESSAGE =
  "Only completed tasks can be reverted to TODO.";

export const REVERT_BLOCKED_BY_DOWNSTREAM_MESSAGE =
  "Cannot revert this task because completed downstream work depends on signals it provided.";

export type JobSignalSourceRef = {
  name: string;
  sourceJobTaskId: string | null;
};

export type DownstreamDoneTaskRef = {
  id: string;
  requiresSignals: string[];
};

/**
 * Signal names on the bus that would be removed when reverting this task
 * (published by this task and still attributed to it).
 */
export function getSignalNamesSourcedByTask(
  taskId: string,
  providesSignals: string[],
  jobSignals: JobSignalSourceRef[],
): string[] {
  if (providesSignals.length === 0) {
    return [];
  }

  const signalByName = new Map(jobSignals.map((row) => [row.name, row]));

  return providesSignals.filter((name) => {
    const row = signalByName.get(name);
    return row != null && row.sourceJobTaskId === taskId;
  });
}

/**
 * DONE peers that still require a signal this revert would retract.
 */
export function findDownstreamDoneTasksBlockingRevert(
  signalNamesToRetract: string[],
  downstreamDoneTasks: DownstreamDoneTaskRef[],
): DownstreamDoneTaskRef[] {
  if (signalNamesToRetract.length === 0) {
    return [];
  }

  const retractSet = new Set(signalNamesToRetract);
  return downstreamDoneTasks.filter((task) =>
    task.requiresSignals.some((signal) => retractSet.has(signal)),
  );
}

export function assertCanRevertJobTaskToTodo(params: {
  currentStatus: JobTaskStatus;
  taskId: string;
  providesSignals: string[];
  jobSignals: JobSignalSourceRef[];
  downstreamDoneTasks: DownstreamDoneTaskRef[];
}): { ok: true; signalNamesToRetract: string[] } | { ok: false; error: string } {
  if (params.currentStatus !== JobTaskStatus.DONE) {
    return { ok: false, error: REVERT_ONLY_FROM_DONE_MESSAGE };
  }

  const signalNamesToRetract = getSignalNamesSourcedByTask(
    params.taskId,
    params.providesSignals,
    params.jobSignals,
  );

  const blockers = findDownstreamDoneTasksBlockingRevert(
    signalNamesToRetract,
    params.downstreamDoneTasks,
  );

  if (blockers.length > 0) {
    return { ok: false, error: REVERT_BLOCKED_BY_DOWNSTREAM_MESSAGE };
  }

  return { ok: true, signalNamesToRetract };
}
