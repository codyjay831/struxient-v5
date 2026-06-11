import {
  JobScheduleEventStatus,
  JobTaskStatus,
  TaskDueGranularity,
  TaskDueMode,
  TaskSchedulingRequirement,
  type JobScheduleEvent,
} from "@prisma/client";
import type { TaskDerivedState } from "@/lib/task-readiness";
import { isOverdueDeadline, isDueTodayDeadline } from "./deadline-timezone";

export type LinkedScheduleEvent = Pick<
  JobScheduleEvent,
  "id" | "status" | "startAt" | "endAt"
>;

export function deriveWorkPackageProgress(input: {
  totalTaskCount: number;
  completedTaskCount: number;
}): number {
  if (input.totalTaskCount <= 0) return 0;
  const ratio = input.completedTaskCount / input.totalTaskCount;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function deriveReturnWorkCandidateTaskIds(input: {
  linkedTasks: Array<{
    taskId: string;
    status: JobTaskStatus;
  }>;
}): string[] {
  return input.linkedTasks
    .filter((task) => task.status === JobTaskStatus.TODO)
    .map((task) => task.taskId);
}

export type TaskDeadlineInput = {
  dueAt: Date | null;
  dueMode: TaskDueMode;
  dueGranularity: TaskDueGranularity | null;
};

export type TaskSchedulingInput = {
  status: JobTaskStatus;
  derivedState: TaskDerivedState;
  schedulingRequirement: TaskSchedulingRequirement;
  linkedEvents: LinkedScheduleEvent[];
};

export function eventSatisfiesRequiredScheduling(
  event: LinkedScheduleEvent,
  now: Date = new Date(),
): boolean {
  if (event.status !== JobScheduleEventStatus.CONFIRMED) return false;
  return event.endAt.getTime() > now.getTime();
}

export function taskHasSatisfyingConfirmedEvent(
  linkedEvents: LinkedScheduleEvent[],
  now: Date = new Date(),
): boolean {
  return linkedEvents.some((event) => eventSatisfiesRequiredScheduling(event, now));
}

export function deriveTaskNeedsScheduling(
  input: TaskSchedulingInput,
  now: Date = new Date(),
): boolean {
  if (input.status !== JobTaskStatus.TODO) return false;
  if (input.derivedState !== "READY") return false;
  if (input.schedulingRequirement !== TaskSchedulingRequirement.REQUIRED) return false;
  return !taskHasSatisfyingConfirmedEvent(input.linkedEvents, now);
}

export function deriveTaskOverdue(
  input: TaskDeadlineInput,
  orgTimezone: string,
  now: Date = new Date(),
): boolean {
  if (!input.dueAt || input.dueMode === TaskDueMode.NONE) return false;
  return isOverdueDeadline(
    input.dueAt,
    input.dueGranularity ?? TaskDueGranularity.EXACT,
    orgTimezone,
    now,
  );
}

export function deriveTaskDueToday(
  input: TaskDeadlineInput,
  orgTimezone: string,
  now: Date = new Date(),
): boolean {
  if (!input.dueAt || input.dueMode === TaskDueMode.NONE) return false;
  if (deriveTaskOverdue(input, orgTimezone, now)) return false;
  return isDueTodayDeadline(
    input.dueAt,
    input.dueGranularity ?? TaskDueGranularity.EXACT,
    orgTimezone,
    now,
  );
}

export type ScheduleConflictKind = "soft" | "hard";

export type ScheduleConflictInput = {
  eventId: string;
  assigneeUserId: string | null;
  status: JobScheduleEventStatus;
  startAt: Date;
  endAt: Date;
  assigneeLabel?: string | null;
};

export function eventsOverlap(a: { startAt: Date; endAt: Date }, b: { startAt: Date; endAt: Date }): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

export function deriveScheduleConflicts(
  events: ScheduleConflictInput[],
): Array<{
  userId: string;
  userLabel: string;
  eventIds: string[];
  kind: ScheduleConflictKind;
  reason: string;
}> {
  const byUser = new Map<string, ScheduleConflictInput[]>();
  for (const event of events) {
    if (!event.assigneeUserId) continue;
    if (
      event.status !== JobScheduleEventStatus.CONFIRMED &&
      event.status !== JobScheduleEventStatus.TENTATIVE
    ) {
      continue;
    }
    const list = byUser.get(event.assigneeUserId) ?? [];
    list.push(event);
    byUser.set(event.assigneeUserId, list);
  }

  const conflicts: Array<{
    userId: string;
    userLabel: string;
    eventIds: string[];
    kind: ScheduleConflictKind;
    reason: string;
  }> = [];

  for (const [userId, userEvents] of byUser.entries()) {
    const sorted = [...userEvents].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        if (!eventsOverlap(a, b)) continue;
        const kind: ScheduleConflictKind =
          a.status === JobScheduleEventStatus.CONFIRMED &&
          b.status === JobScheduleEventStatus.CONFIRMED
            ? "hard"
            : "soft";
        conflicts.push({
          userId,
          userLabel: a.assigneeLabel || b.assigneeLabel || "Assigned user",
          eventIds: [a.eventId, b.eventId],
          kind,
          reason:
            kind === "hard"
              ? "Overlapping confirmed commitments for the same assignee."
              : "Overlapping tentative/planning blocks for the same assignee.",
        });
      }
    }
  }

  return conflicts;
}

export function deriveEventPotentiallyMissed(
  event: Pick<JobScheduleEvent, "status" | "startAt" | "endAt">,
  now: Date = new Date(),
): boolean {
  return (
    event.status === JobScheduleEventStatus.CONFIRMED &&
    event.endAt.getTime() <= now.getTime()
  );
}

export function deriveEventUpcoming(
  event: Pick<JobScheduleEvent, "status" | "startAt" | "endAt">,
  now: Date = new Date(),
): boolean {
  return (
    (event.status === JobScheduleEventStatus.CONFIRMED ||
      event.status === JobScheduleEventStatus.TENTATIVE) &&
    event.endAt.getTime() > now.getTime()
  );
}

export function formatDeadlineProvenance(input: {
  dueMode: TaskDueMode;
  dueAnchor: string | null;
  dueOffsetDays: number | null;
  dueGranularity: TaskDueGranularity | null;
}): string | null {
  if (input.dueMode === TaskDueMode.NONE) return null;
  if (input.dueMode === TaskDueMode.MANUAL) {
    return input.dueGranularity === TaskDueGranularity.DATE_ONLY ? "Manual (date)" : "Manual";
  }
  if (input.dueMode === TaskDueMode.DERIVED) {
    const anchorLabel =
      input.dueAnchor === "JOB_ACTIVATION"
        ? "job activation"
        : input.dueAnchor === "FIRST_READY"
          ? "first ready"
          : "rule";
    const days = input.dueOffsetDays ?? 0;
    return `Derived: ${days} day${days === 1 ? "" : "s"} after ${anchorLabel}`;
  }
  return null;
}
