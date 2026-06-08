export type TaskTimingUpdateInput = {
  taskId: string;
  assignedUserId?: string | null;
  dueAt?: Date | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
};

export function buildDueOnlyTaskTimingUpdate(
  taskId: string,
  dueAt: Date | null,
  assignedUserId?: string | null,
): TaskTimingUpdateInput {
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
  return {
    taskId,
    dueAt: undefined,
    scheduledStartAt,
    scheduledEndAt,
    assignedUserId: assignedUserId ?? null,
  };
}

