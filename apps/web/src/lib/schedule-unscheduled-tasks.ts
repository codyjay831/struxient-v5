import { TaskTemplateCategory } from "@prisma/client";
import type { UnscheduledScheduleItem } from "./schedule-query";

export type ReadyUnscheduledTaskCandidate = {
  id: string;
  title: string;
  jobId: string;
  jobTitle: string;
  category: TaskTemplateCategory;
  dueAt: Date | null;
  updatedAt: Date;
};

export type ReadyUnscheduledTaskState =
  | "READY"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_SIGNAL"
  | "NEEDS_PROOF"
  | "COMPLETED";

export function deriveUnscheduledTaskItems(
  tasks: Array<ReadyUnscheduledTaskCandidate & { state: ReadyUnscheduledTaskState }>,
): UnscheduledScheduleItem[] {
  const byJob = new Map<string, ReadyUnscheduledTaskCandidate[]>();

  for (const task of tasks) {
    if (task.state !== "READY") continue;
    const existing = byJob.get(task.jobId) ?? [];
    existing.push(task);
    byJob.set(task.jobId, existing);
  }

  const unscheduled: UnscheduledScheduleItem[] = [];
  for (const [jobId, jobTasks] of byJob.entries()) {
    const prioritized = [...jobTasks].sort((a, b) => {
      const aIsScheduling = a.category === TaskTemplateCategory.SCHEDULING;
      const bIsScheduling = b.category === TaskTemplateCategory.SCHEDULING;
      if (aIsScheduling !== bIsScheduling) return aIsScheduling ? -1 : 1;
      if (a.dueAt && b.dueAt) return a.dueAt.getTime() - b.dueAt.getTime();
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    for (const task of prioritized.slice(0, 5)) {
      unscheduled.push({
        id: `task-unscheduled-${task.id}`,
        kind: "task-needs-schedule",
        title: task.title,
        subtitle: task.jobTitle,
        reason:
          task.category === TaskTemplateCategory.SCHEDULING
            ? "Scheduling coordination task is ready but has no timing set."
            : "Ready task has no scheduled block yet.",
        actionLabel: task.category === TaskTemplateCategory.SCHEDULING ? "Set task timing" : "Schedule task",
        recordHref: `/jobs/${jobId}`,
        recordId: task.id,
        parentId: jobId,
      });
    }
  }

  return unscheduled;
}

