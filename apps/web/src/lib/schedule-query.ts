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
import { shouldLoadAllLeadVisitsForSchedule } from "@/lib/scheduling/lead-visit-access";
import {
  formatLeadVisitStatusLabel,
  resolveLeadVisitScheduledStart,
} from "@/lib/scheduling/lead-visit-schedule-service";
import {
  DEFAULT_ESTIMATED_DURATION_MINUTES,
  hasAccessSnapshotContent,
  LeadVisitAccessSnapshotSchema,
} from "@/lib/scheduling/lead-visit-schemas";

function scopeHrefForLeadQuotes(
  quotes: Array<{ id: string; status: string }>,
  leadId: string,
): string {
  const draft = quotes.find((quote) => quote.status === "DRAFT");
  if (draft) return `/quotes/${draft.id}`;
  const working = quotes[0];
  if (working) return `/quotes/${working.id}`;
  return `/leads/${leadId}`;
}

export type ScheduleView = "month" | "week" | "day" | "agenda";

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
  /** When set, links field staff to quote scope during estimate visits. */
  scopeHref?: string;
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
  /** When set, links field staff to quote scope during estimate visits. */
  scopeHref?: string;
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
  const loadAllLeadVisits = shouldLoadAllLeadVisitsForSchedule(role);
  const jobVisibilityWhere = getJobVisibilityWhere(role, userId);
  const taskVisibilityWhere = getTaskVisibilityWhere(role, userId);

  const leadVisitDateRangeFilter = {
    OR: [
      { scheduledStartAt: { gte: range.startAt, lt: range.endAt } },
      {
        AND: [
          { scheduledStartAt: null },
          { confirmedDate: { gte: range.startAt, lt: range.endAt } },
        ],
      },
      {
        AND: [
          { scheduledStartAt: null },
          { confirmedDate: null },
          { requestedDate: { gte: range.startAt, lt: range.endAt } },
        ],
      },
    ],
  };

  const [leadRequests, scheduleEvents, blocks, tasksInRange, readyTaskCandidates] = await Promise.all([
    loadAllLeadVisits || role === StaffRole.FIELD
      ? db.leadVisitRequest.findMany({
          where: {
            organizationId,
            status: { in: [LeadVisitRequestStatus.PENDING, LeadVisitRequestStatus.CONFIRMED] },
            ...leadVisitDateRangeFilter,
            ...(loadAllLeadVisits ? {} : { assignedUserId: userId }),
          },
          select: {
            id: true,
            status: true,
            requestedDate: true,
            requestedWindow: true,
            confirmedDate: true,
            scheduledStartAt: true,
            scheduledEndAt: true,
            estimatedDurationMinutes: true,
            arrivalWindowLabel: true,
            assignedUserId: true,
            accessSnapshotJson: true,
            outcome: true,
            nextAction: true,
            notes: true,
            assignedUser: { select: { id: true, name: true, email: true } },
            lead: {
              select: {
                id: true,
                title: true,
                contact: true,
                quotes: {
                  where: { status: { not: "ARCHIVED" } },
                  orderBy: { updatedAt: "desc" },
                  take: 3,
                  select: { id: true, status: true },
                },
              },
            },
          },
          orderBy: [{ scheduledStartAt: "asc" }, { confirmedDate: "asc" }, { requestedDate: "asc" }],
        })
      : Promise.resolve([]),
    queryOrganizationScheduleProjection({ organizationId, range, role, userId }),
    db.scheduleBlock.findMany({
      where: {
        organizationId,
        ...(commercialReadable ? {} : { userId }),
        startAt: { lt: range.endAt },
        OR: [{ endAt: null }, { endAt: { gt: range.startAt } }],
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
          { dueAt: { gte: range.startAt, lt: range.endAt } },
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
    const eventDate = resolveLeadVisitScheduledStart(request);
    if (!eventDate) continue;

    const accessParsed = LeadVisitAccessSnapshotSchema.safeParse(request.accessSnapshotJson);
    const hasAccess = accessParsed.success && hasAccessSnapshotContent(accessParsed.data);
    const durationMinutes = request.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES;
    const endAt =
      request.scheduledEndAt ??
      new Date(eventDate.getTime() + durationMinutes * 60 * 1000);

    const subtitleParts = [
      formatLeadVisitStatusLabel(request.status),
      request.arrivalWindowLabel ?? request.requestedWindow ?? undefined,
      !hasAccess ? "Missing access details" : undefined,
    ].filter(Boolean);

    events.push({
      id: `lead-visit-${request.id}`,
      kind: "lead-visit-request",
      title: request.lead.title,
      subtitle: subtitleParts.join(" · ") || request.notes || undefined,
      status: request.status,
      startAt: eventDate,
      endAt,
      assigneeUserId: request.assignedUserId,
      assigneeLabel:
        request.assignedUser?.name ?? request.assignedUser?.email ?? null,
      recordHref: `/leads/${request.lead.id}`,
      scopeHref: scopeHrefForLeadQuotes(request.lead.quotes, request.lead.id),
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
        scopeHref: scopeHrefForLeadQuotes(request.lead.quotes, request.lead.id),
        recordId: request.id,
        parentId: request.lead.id,
      });
    }
  }

  unscheduled.push(...deriveUnscheduledTaskItems(readyTaskStates));

  const conflicts = deriveCanonicalScheduleConflicts(
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
    eventIds: conflict.eventIds.map((id) => `schedule-event-${id}`),
    reason: conflict.reason,
  }));

  return { events, unscheduled, conflicts };
}

