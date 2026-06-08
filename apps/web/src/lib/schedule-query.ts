import {
  JobIssueSeverity,
  JobIssueStatus,
  JobStatus,
  JobTaskStatus,
  JobVisitStatus,
  LeadVisitRequestStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getLiveSignals } from "@/lib/signal-bus";
import { deriveTaskState, toTaskReadinessInput } from "@/lib/task-readiness";
import { deriveUnscheduledTaskItems, type ReadyUnscheduledTaskCandidate } from "@/lib/schedule-unscheduled-tasks";

export type ScheduleView = "month" | "week" | "day" | "agenda" | "dispatch";

export type ScheduleEventKind =
  | "lead-visit-request"
  | "job-visit"
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

export async function queryOrganizationSchedule(
  organizationId: string,
  range: { startAt: Date; endAt: Date },
): Promise<ScheduleQueryResult> {
  const [leadRequests, visits, blocks, jobs, tasksInRange, readyTaskCandidates] = await Promise.all([
    db.leadVisitRequest.findMany({
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
    }),
    db.jobVisit.findMany({
      where: {
        organizationId,
        status: { in: [JobVisitStatus.SCHEDULED, JobVisitStatus.COMPLETED] },
        scheduledStartAt: { gte: range.startAt, lte: range.endAt },
      },
      select: {
        id: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        status: true,
        assignedUserId: true,
        notes: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { scheduledStartAt: "asc" },
    }),
    db.scheduleBlock.findMany({
      where: {
        organizationId,
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
    db.job.findMany({
      where: { organizationId, status: JobStatus.ACTIVE },
      select: {
        id: true,
        title: true,
        customerId: true,
        updatedAt: true,
        visits: {
          where: { status: JobVisitStatus.SCHEDULED, scheduledStartAt: { gt: new Date() } },
          select: { id: true },
        },
        tasks: {
          where: { status: JobTaskStatus.TODO },
          select: { id: true },
        },
      },
    }),
    db.jobTask.findMany({
      where: {
        job: { organizationId },
        status: JobTaskStatus.TODO,
        OR: [
          { dueAt: { gte: range.startAt, lte: range.endAt } },
          { scheduledStartAt: { gte: range.startAt, lte: range.endAt } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        assignedUserId: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        requiresSignals: true,
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
      orderBy: [{ dueAt: "asc" }, { scheduledStartAt: "asc" }],
    }),
    db.jobTask.findMany({
      where: {
        job: { organizationId },
        status: JobTaskStatus.TODO,
        scheduledStartAt: null,
      },
      select: {
        id: true,
        title: true,
        status: true,
        category: true,
        dueAt: true,
        scheduledStartAt: true,
        scheduledEndAt: true,
        updatedAt: true,
        assignedUserId: true,
        assignedUser: { select: { id: true, name: true, email: true } },
        requiresSignals: true,
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

  for (const visit of visits) {
    events.push({
      id: `job-visit-${visit.id}`,
      kind: "job-visit",
      title: visit.job.title,
      subtitle: visit.notes ?? undefined,
      status: visit.status,
      startAt: visit.scheduledStartAt,
      endAt: visit.scheduledEndAt,
      assigneeUserId: visit.assignedUserId,
      assigneeLabel: visit.assignedUser?.name ?? visit.assignedUser?.email ?? null,
      recordHref: `/jobs/${visit.job.id}`,
      recordId: visit.id,
      parentId: visit.job.id,
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

    if (task.scheduledStartAt) {
      events.push({
        id: `task-scheduled-${task.id}`,
        kind: "task",
        title: task.title,
        subtitle: task.job.title,
        status: "Scheduled",
        startAt: task.scheduledStartAt,
        endAt: task.scheduledEndAt,
        assigneeUserId: task.assignedUserId,
        assigneeLabel: task.assignedUser?.name ?? task.assignedUser?.email ?? null,
        recordHref: `/jobs/${task.job.id}`,
        recordId: task.id,
        parentId: task.job.id,
      });
    } else if (task.dueAt) {
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
      category: task.category,
      dueAt: task.dueAt,
      updatedAt: task.updatedAt,
      state,
    });
  }

  const unscheduled: UnscheduledScheduleItem[] = [];
  for (const job of jobs) {
    if (job.tasks.length > 0 && job.visits.length === 0) {
      unscheduled.push({
        id: `job-needs-visit-${job.id}`,
        kind: "job-needs-visit",
        title: job.title,
        reason: "Active job has open tasks but no future scheduled visit.",
        actionLabel: "Schedule visit",
        recordHref: `/jobs/${job.id}`,
        recordId: job.id,
      });
    }
  }

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

  const conflicts = deriveScheduleConflicts(events);

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

