import {
  TaskDueMode,
  TaskSchedulingRequirement,
  type JobScheduleEventStatus,
} from "@prisma/client";
import type { TaskDerivedState } from "@/lib/task-readiness";
import {
  deriveTaskNeedsScheduling,
  type LinkedScheduleEvent,
} from "@/lib/scheduling/scheduling-derivation";

export type SchedulingAttentionOverride = {
  status: string;
  priority: "high";
  group: "ready";
  lens: "today";
  reason: string;
  nextStep: string;
};

export function deriveSchedulingAttentionOverride(input: {
  derivedState: TaskDerivedState;
  schedulingRequirement: TaskSchedulingRequirement;
  linkedEvents: LinkedScheduleEvent[];
  dueMode: TaskDueMode;
  dueAt: Date | null;
}): SchedulingAttentionOverride | null {
  if (input.derivedState !== "READY") return null;

  const needsScheduling = deriveTaskNeedsScheduling({
    status: "TODO",
    derivedState: input.derivedState,
    schedulingRequirement: input.schedulingRequirement,
    linkedEvents: input.linkedEvents,
  });

  if (needsScheduling) {
    return {
      status: "Needs schedule",
      priority: "high",
      group: "ready",
      lens: "today",
      reason: "Task requires a confirmed calendar commitment but none is active.",
      nextStep: "Create and confirm a schedule event for this task.",
    };
  }

  const hasDeadline =
    input.dueMode !== TaskDueMode.NONE && input.dueAt !== null;
  if (!hasDeadline && input.schedulingRequirement === TaskSchedulingRequirement.OPTIONAL) {
    return null;
  }

  return null;
}

export function mapLinkedEventsFromRows(
  rows: Array<{
    jobScheduleEvent: {
      id: string;
      status: JobScheduleEventStatus;
      startAt: Date;
      endAt: Date;
    };
  }>,
): LinkedScheduleEvent[] {
  return rows.map((row) => ({
    id: row.jobScheduleEvent.id,
    status: row.jobScheduleEvent.status,
    startAt: row.jobScheduleEvent.startAt,
    endAt: row.jobScheduleEvent.endAt,
  }));
}
