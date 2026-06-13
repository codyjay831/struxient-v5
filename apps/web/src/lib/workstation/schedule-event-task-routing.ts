import { JobTaskStatus } from "@prisma/client";
import type { WorkstationWorkItem } from "@/lib/workstation-query";

export type ScheduleEventTaskLinkRow = {
  jobTask: {
    id: string;
    completedAt: Date | null;
    status: JobTaskStatus;
  };
};

/** First incomplete task linked to a schedule event — the executable work surface. */
export function pickPrimaryLinkedOpenTaskId(
  taskLinks: ScheduleEventTaskLinkRow[] | undefined,
): string | null {
  if (!taskLinks?.length) return null;

  const openTasks = taskLinks
    .map((link) => link.jobTask)
    .filter(
      (task) =>
        !task.completedAt &&
        task.status !== JobTaskStatus.DONE &&
        task.status !== JobTaskStatus.CANCELED,
    );

  return openTasks[0]?.id ?? null;
}

export function findTaskWorkItemForScheduleEvent(
  eventRecordId: string,
  allItems: WorkstationWorkItem[],
): WorkstationWorkItem | null {
  const scheduleItem = allItems.find(
    (item) => item.kind === "schedule" && item.recordId === eventRecordId,
  );
  const taskId = scheduleItem?.actionTaskId;
  if (!taskId) return null;
  return allItems.find((item) => item.kind === "task" && item.recordId === taskId) ?? null;
}

/** Prefer the task work item when a schedule signal points at executable task work. */
export function resolveExecutableWorkItem(
  item: WorkstationWorkItem,
  allItems: WorkstationWorkItem[],
): WorkstationWorkItem {
  if (item.kind !== "schedule" || !item.actionTaskId) return item;

  const taskItem = allItems.find(
    (candidate) =>
      candidate.kind === "task" && candidate.recordId === item.actionTaskId,
  );
  return taskItem ?? item;
}
