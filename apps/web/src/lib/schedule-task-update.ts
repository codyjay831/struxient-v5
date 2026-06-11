export type TaskTimingUpdateInput = {
  taskId: string;
  assignedUserId?: string | null;
  dueAt?: Date | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
};

function assertTaskTimingTarget(taskId: string) {
  // Guard against accidental routing of canonical event IDs into task timing mutations.
  if (taskId.startsWith("schedule-event-")) {
    throw new Error("Task timing updates require a task ID, not a schedule-event ID.");
  }
}

export function buildDueOnlyTaskTimingUpdate(
  taskId: string,
  dueAt: Date | null,
  assignedUserId?: string | null,
): TaskTimingUpdateInput {
  assertTaskTimingTarget(taskId);
  return {
    taskId,
    dueAt,
    assignedUserId: assignedUserId ?? null,
    scheduledStartAt: undefined,
    scheduledEndAt: undefined,
  };
}

export function buildScheduledBlockTaskTimingUpdate(
  taskId: string,
  scheduledStartAt: Date | null,
  scheduledEndAt: Date | null,
  assignedUserId?: string | null,
): TaskTimingUpdateInput {
  assertTaskTimingTarget(taskId);
  return {
    taskId,
    dueAt: undefined,
    scheduledStartAt,
    scheduledEndAt,
    assignedUserId: assignedUserId ?? null,
  };
}

