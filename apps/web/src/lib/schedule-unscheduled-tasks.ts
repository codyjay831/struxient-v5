import { TaskSchedulingRequirement } from "@prisma/client";
import type { UnscheduledScheduleItem } from "./schedule-query";
import { deriveTaskNeedsScheduling } from "./scheduling/scheduling-derivation";

export type ReadyUnscheduledTaskCandidate = {
  id: string;
  title: string;
  jobId: string;
  jobTitle: string;
  schedulingRequirement: TaskSchedulingRequirement;
  dueAt: Date | null;
  updatedAt: Date;
  linkedEvents: Array<{
    id: string;
    status: import("@prisma/client").JobScheduleEventStatus;
    startAt: Date;
    endAt: Date;
  }>;
};

export type ReadyUnscheduledTaskState =
  | "READY"
  | "BLOCKED_BY_ISSUE"
  | "BLOCKED_BY_SIGNAL"
  | "NEEDS_PROOF"
  | "COMPLETED";

export function deriveUnscheduledTaskItems(
  tasks: Array<ReadyUnscheduledTaskCandidate & { state: ReadyUnscheduledTaskState }>,
  now: Date = new Date(),
): UnscheduledScheduleItem[] {
  const unscheduled: UnscheduledScheduleItem[] = [];

  for (const task of tasks) {
    if (task.state !== "READY") continue;
    if (task.schedulingRequirement !== TaskSchedulingRequirement.REQUIRED) continue;

    const needsScheduling = deriveTaskNeedsScheduling(
      {
        status: "TODO",
        derivedState: "READY",
        schedulingRequirement: task.schedulingRequirement,
        linkedEvents: task.linkedEvents,
      },
      now,
    );
    if (!needsScheduling) continue;

    unscheduled.push({
      id: `task-unscheduled-${task.id}`,
      kind: "task-needs-schedule",
      title: task.title,
      subtitle: task.jobTitle,
      reason: "Task requires a confirmed schedule event with a future end time.",
      actionLabel: "Schedule task",
      recordHref: `/jobs/${task.jobId}`,
      recordId: task.id,
      parentId: task.jobId,
    });
  }

  return unscheduled.sort((a, b) => a.title.localeCompare(b.title)).slice(0, 50);
}
