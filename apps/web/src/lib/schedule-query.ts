import {
  StaffRole,
  JobIssueSeverity,
  JobIssueStatus,
  JobScheduleEventStatus,
  JobTaskStatus,
  LeadVisitRequestStatus,
  TaskSchedulingRequirement,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getLiveSignals } from "@/lib/signal-bus";
import { deriveTaskState, toTaskReadinessInput } from "@/lib/task-readiness";
import { deriveUnscheduledTaskItems, type ReadyUnscheduledTaskCandidate } from "@/lib/schedule-unscheduled-tasks";
import { deriveScheduleConflicts as deriveCanonicalScheduleConflicts } from "@/lib/scheduling/scheduling-derivation";
import { queryOrganizationScheduleProjection } from "@/lib/scheduling/schedule-projection";
import {
  getJobVisibilityWhere,
  getTaskVisibilityWhere,
} from "@/lib/authz/resource-access";
import { canReadCommercial } from "@/lib/authz/capabilities";

export type ScheduleView = "month" | "week" | "day" | "agenda" | "dispatch";

export type ScheduleEventKind =
  | "lead-visit-request"
  | "job-schedule-event"
  | "task"
  | "schedule-block"
  | "payment-overlay";

export type ScheduleEvent = {
  id: string;
  kind: ScheduleEventKind;
  title: string;
  subtitle?: string;
  status?: string;
  startAt: Date;
  endAt: Date | null;
  allDay?: boolean;
  assigneeUserId?: string | null;
  assigneeLabel?: string | null;
  recordHref?: string;
  recordId: string;
  parentId?: string;
};

export type UnscheduledScheduleItem = {
  id: string;
  kind: "lead-visit-request" | "job-needs-visit" | "task-needs-schedule";
  title: string;
  subtitle?: string;
  reason: string;
  actionLabel: string;
  recordHref?: string;
  recordId: string;
  parentId?: string;
};

export type ScheduleConflict = {
  userId: string;
  userLabel: string;
  eventIds: string[];
  reason: string;
};

export type ScheduleQueryResult = {
  events: ScheduleEvent[];
  unscheduled: UnscheduledScheduleItem[];
  conflicts: ScheduleConflict[];
};

type CanonicalTaskScheduleLink = {
  jobScheduleEvent: {
    status: JobScheduleEventStatus;
  };
};

const ACTIVE_CALENDAR_EVENT_STATUSES = new Set<JobScheduleEventStatus>([
  JobScheduleEventStatus.TENTATIVE,
  JobScheduleEventStatus.CONFIRMED,
]);

export function hasActiveCanonicalTaskScheduleLink(
  links: CanonicalTaskScheduleLink[],
): boolean {
  return links.some((link) =>
    ACTIVE_CALENDAR_EVENT_STATUSES.has(link.jobScheduleEvent.status),
  );
}

export async function queryOrganizationSchedule(
  organizationId: string,
  range: { startAt: Date; endAt: Date },
  role: StaffRole,
  userId: string,
): Promise<ScheduleQueryResult> {
  const commercialReadable = canReadCommercial(role);
  const jobVisibilityWhere = getJobVisibilityWhere(role, userId);
  const taskVisibilityWhere = getTaskVisibilityWhere(role, userId);

  const [leadRequests, scheduleEvents, blocks, tasksInRange, readyTaskCandidates] = await Promise.all([
    commercialReadable
      ? db.leadVisitRequest.findMany({
      where: {
        organizationId,
        status: { in: [LeadVisitRequestStatus.PENDING, LeadVisitRequestStatus.CONFIRMED] },
        OR: [
          { confirmedDate: { gte: range.startAt, lte: range.endAt } },
          { requestedDate: { gte: range.startAt, lte: range.endAt } },
        ],
      },
      select: {
        id: true,
        status: true,
        requestedDate: true,
        confirmedDate: true,
        requestedWindow: true,
        notes: true,
        lead: {
          select: {
            id: true,
            title: true,
            contact: true,
          },
        },
      },
      orderBy: [{ confirmedDate: "asc" }, { requestedDate: "asc" }],
      })
      : Promise.resolve([]),
    queryOrganizationScheduleProjection({ organizationId, range, role, userId }),
    db.scheduleBlock.findMany({
      where: {
        organizationId,
        ...(commercialReadable ? {} : { userId }),
        startAt: { lte: range.endAt },
        OR: [{ endAt: null }, { endAt: { gte: range.startAt } }],
      },
      select: {
        id: true,
        title: true,
        type: true,
        startAt: true,
        endAt: true,
        allDay: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    db.jobTask.findMany({
      where: {
        job: { organizationId, ...jobVisibilityWhere },
        status: JobTaskStatus.TODO,
        ...taskVisibilityWhere,
        OR: [
          { dueAt: { gte: range.startAt, lte: range.endAt } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        assignedUserId: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        requiresSignals: true,
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
          select: { id: true, status: true, severity: true },
        },
        recoveryFlow: { select: { jobIssueId: true } },
        scheduleEventLinks: {
          where: {
            jobScheduleEvent: {
              status: {
                in: [JobScheduleEventStatus.TENTATIVE, JobScheduleEventStatus.CONFIRMED],
              },
            },
          },
          select: {
            jobScheduleEvent: {
              select: {
                status: true,
              },
            },
          },
        },
        jobStage: {
          select: {
            issues: {
              where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
              select: { id: true, status: true, severity: true },
            },
          },
        },
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ dueAt: "asc" }],
    }),
    db.jobTask.findMany({
      where: {
        job: { organizationId, ...jobVisibilityWhere },
        status: JobTaskStatus.TODO,
        schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
        ...taskVisibilityWhere,
      },
      select: {
        id: true,
        title: true,
        status: true,
        schedulingRequirement: true,
        dueAt: true,
        updatedAt: true,
        requiresSignals: true,
        scheduleEventLinks: {
          where: {
            jobScheduleEvent: {
              status: {
                in: [JobScheduleEventStatus.TENTATIVE, JobScheduleEventStatus.CONFIRMED],
              },
            },
          },
          select: {
            jobScheduleEvent: {
              select: {
                id: true,
                status: true,
                startAt: true,
                endAt: true,
              },
            },
          },
        },
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
          select: { id: true, status: true, severity: true },
        },
        recoveryFlow: { select: { jobIssueId: true } },
        jobStage: {
          select: {
            issues: {
              where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
              select: { id: true, status: true, severity: true },
            },
          },
        },
        job: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  const events: ScheduleEvent[] = [];
  for (const canonicalEvent of scheduleEvents) {
    events.push({
      id: `schedule-event-${canonicalEvent.id}`,
      kind: "job-schedule-event",
      title: canonicalEvent.title ?? canonicalEvent.job.title,
      subtitle: canonicalEvent.kind.replaceAll("_", " "),
      status: canonicalEvent.status,
      startAt: canonicalEvent.startAt,
      endAt: canonicalEvent.endAt,
      assigneeUserId: canonicalEvent.leadUserId,
      assigneeLabel:
        canonicalEvent.leadUser?.name ?? canonicalEvent.leadUser?.email ?? null,
      recordHref: `/jobs/${canonicalEvent.job.id}`,
      recordId: canonicalEvent.id,
      parentId: canonicalEvent.job.id,
    });
  }

  for (const request of leadRequests) {
    const eventDate = request.confirmedDate ?? request.requestedDate;
    if (!eventDate) continue;

    events.push({
      id: `lead-visit-${request.id}`,
      kind: "lead-visit-request",
      title: request.lead.title,
      subtitle: request.requestedWindow ?? request.notes ?? undefined,
      status: request.status,
      startAt: eventDate,
      endAt: null,
      recordHref: `/leads/${request.lead.id}`,
      recordId: request.id,
      parentId: request.lead.id,
    });
  }

  for (const block of blocks) {
    events.push({
      id: `schedule-block-${block.id}`,
      kind: "schedule-block",
      title: block.title,
      subtitle: block.type.replaceAll("_", " "),
      status: block.type,
      startAt: block.startAt,
      endAt: block.endAt,
      allDay: block.allDay,
      assigneeUserId: block.userId,
      assigneeLabel: block.user?.name ?? block.user?.email ?? null,
      recordId: block.id,
    });
  }

  const readyTaskStates: Array<ReadyUnscheduledTaskCandidate & { state: ReturnType<typeof deriveTaskState> }> = [];
  const jobIds = [...new Set([...tasksInRange, ...readyTaskCandidates].map((t) => t.job.id))];
  const liveSignalMap = new Map<string, string[]>();
  await Promise.all(
    jobIds.map(async (jobId) => {
      liveSignalMap.set(jobId, await getLiveSignals(jobId));
    }),
  );

  for (const task of tasksInRange) {
    const liveSignals = liveSignalMap.get(task.job.id) ?? [];
    const state = deriveTaskState(
      toTaskReadinessInput(task, {
        requiresSignals: [],
        issues: task.jobStage.issues,
      }),
      liveSignals,
      { recoveryFlowIssueId: task.recoveryFlow?.jobIssueId },
    );

    if (state === "BLOCKED_BY_ISSUE") continue;

    if (task.dueAt) {
      events.push({
        id: `task-due-${task.id}`,
        kind: "task",
        title: task.title,
        subtitle: task.job.title,
        status: "Due",
        startAt: task.dueAt,
        endAt: null,
        assigneeUserId: task.assignedUserId,
        assigneeLabel: task.assignedUser?.name ?? task.assignedUser?.email ?? null,
        recordHref: `/jobs/${task.job.id}`,
        recordId: task.id,
        parentId: task.job.id,
      });
    }

  }

  for (const task of readyTaskCandidates) {
    const liveSignals = liveSignalMap.get(task.job.id) ?? [];
    const state = deriveTaskState(
      toTaskReadinessInput(task, {
        requiresSignals: [],
        issues: task.jobStage.issues,
      }),
      liveSignals,
      { recoveryFlowIssueId: task.recoveryFlow?.jobIssueId },
    );

    if (state !== "READY") continue;

    readyTaskStates.push({
      id: task.id,
      title: task.title,
      jobId: task.job.id,
      jobTitle: task.job.title,
      schedulingRequirement: task.schedulingRequirement,
      dueAt: task.dueAt,
      updatedAt: task.updatedAt,
      linkedEvents: task.scheduleEventLinks.map((link) => link.jobScheduleEvent),
      state,
    });
  }

  const unscheduled: UnscheduledScheduleItem[] = [];
  for (const request of leadRequests) {
    if (request.status === LeadVisitRequestStatus.PENDING) {
      unscheduled.push({
        id: `lead-pending-${request.id}`,
        kind: "lead-visit-request",
        title: request.lead.title,
        subtitle: request.requestedWindow ?? undefined,
        reason: "Estimate request is pending confirmation.",
        actionLabel: "Confirm estimate",
        recordHref: `/leads/${request.lead.id}`,
        recordId: request.id,
        parentId: request.lead.id,
      });
    }
  }

  unscheduled.push(...deriveUnscheduledTaskItems(readyTaskStates));

  const conflicts = deriveScheduleConflicts(events).concat(
    deriveCanonicalScheduleConflicts(
      scheduleEvents.map((event) => ({
        eventId: event.id,
        assigneeUserId: event.leadUserId,
        assigneeLabel: event.leadUser?.name ?? event.leadUser?.email ?? null,
        status: event.status,
        startAt: event.startAt,
        endAt: event.endAt,
      })),
    ).map((conflict) => ({
      userId: conflict.userId,
      userLabel: conflict.userLabel,
      eventIds: conflict.eventIds,
      reason: conflict.reason,
    })),
  );

  return { events, unscheduled, conflicts };
}

function deriveScheduleConflicts(events: ScheduleEvent[]): ScheduleConflict[] {
  const byUser = new Map<string, ScheduleEvent[]>();
  for (const event of events) {
    if (!event.assigneeUserId) continue;
    if (!event.startAt) continue;
    const list = byUser.get(event.assigneeUserId) ?? [];
    list.push(event);
    byUser.set(event.assigneeUserId, list);
  }

  const conflicts: ScheduleConflict[] = [];
  for (const [userId, userEvents] of byUser.entries()) {
    const sorted = userEvents
      .filter((e) => e.endAt)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      if (!prev.endAt || !current.endAt) continue;
      if (current.startAt < prev.endAt) {
        conflicts.push({
          userId,
          userLabel: current.assigneeLabel || prev.assigneeLabel || "Assigned user",
          eventIds: [prev.id, current.id],
          reason: "Overlapping scheduled work for the same assignee.",
        });
      }
    }
  }

  return conflicts;
}

