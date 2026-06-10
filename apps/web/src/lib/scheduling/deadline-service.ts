import {
  JobActivityType,
  JobIssueSeverity,
  JobIssueStatus,
  JobTaskStatus,
  TaskDueAnchor,
  TaskDueGranularity,
  TaskDueMode,
  type Prisma,
} from "@prisma/client";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { deriveTaskState, toTaskReadinessInput } from "@/lib/task-readiness";
import { getLiveSignals } from "@/lib/signal-bus";
import { recordJobActivity } from "@/lib/job-activity-helper";
import {
  addCalendarDaysInTimezone,
  getOrgTimezone,
  parseDateOnlyInput,
} from "./deadline-timezone";

export type DeadlineServiceError = { error: string };

export type SetManualDeadlineInput = {
  organizationId: string;
  taskId: string;
  actorUserId?: string;
  dueAt: Date | null;
  granularity: TaskDueGranularity;
  /** YYYY-MM-DD when granularity is DATE_ONLY */
  dateOnlyInput?: string;
};

export type SetDerivedRuleInput = {
  organizationId: string;
  taskId: string;
  actorUserId?: string;
  anchor: TaskDueAnchor;
  offsetDays: number;
  granularity: TaskDueGranularity;
};

export type RecalculateDerivedDeadlineInput = {
  organizationId: string;
  taskId: string;
  actorUserId?: string;
  reason: string;
};

type TaskDeadlineRow = {
  id: string;
  jobId: string;
  title: string;
  status: JobTaskStatus;
  dueAt: Date | null;
  dueMode: TaskDueMode;
  dueAnchor: TaskDueAnchor | null;
  dueOffsetDays: number | null;
  dueGranularity: TaskDueGranularity | null;
  dueResolvedAt: Date | null;
  dueFirstReadyAt: Date | null;
  job: { activatedAt: Date; organization: { timezone: string } };
};

async function loadTaskForDeadline(
  organizationId: string,
  taskId: string,
  tx: ExtendedTransactionClient,
): Promise<TaskDeadlineRow | null> {
  return tx.jobTask.findFirst({
    where: { id: taskId, job: { organizationId } },
    select: {
      id: true,
      jobId: true,
      title: true,
      status: true,
      dueAt: true,
      dueMode: true,
      dueAnchor: true,
      dueOffsetDays: true,
      dueGranularity: true,
      dueResolvedAt: true,
      dueFirstReadyAt: true,
      job: {
        select: {
          activatedAt: true,
          organization: { select: { timezone: true } },
        },
      },
    },
  });
}

export function computeDerivedDueAt(input: {
  anchor: TaskDueAnchor;
  offsetDays: number;
  granularity: TaskDueGranularity;
  jobActivatedAt: Date;
  firstReadyAt: Date;
  orgTimezone: string;
}): Date {
  const anchorInstant =
    input.anchor === TaskDueAnchor.JOB_ACTIVATION
      ? input.jobActivatedAt
      : input.firstReadyAt;

  if (input.granularity === TaskDueGranularity.DATE_ONLY) {
    return addCalendarDaysInTimezone(
      anchorInstant,
      input.offsetDays,
      getOrgTimezone(input.orgTimezone),
    );
  }

  return new Date(anchorInstant.getTime() + input.offsetDays * 24 * 60 * 60 * 1000);
}

function resolveManualDueAt(
  input: SetManualDeadlineInput,
  orgTimezone: string,
): Date | null {
  if (input.dueAt === null) return null;
  if (input.granularity === TaskDueGranularity.DATE_ONLY) {
    if (input.dateOnlyInput) {
      return parseDateOnlyInput(input.dateOnlyInput, getOrgTimezone(orgTimezone));
    }
    const tz = getOrgTimezone(orgTimezone);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(input.dueAt);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return parseDateOnlyInput(
      `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      tz,
    );
  }
  return input.dueAt;
}

async function auditDeadlineChange(
  input: {
    organizationId: string;
    jobId: string;
    taskId: string;
    title: string;
    actorUserId?: string;
    auditTitle: string;
    details?: string;
    metadataJson?: Prisma.InputJsonValue;
  },
  tx: ExtendedTransactionClient,
) {
  await recordJobActivity(
    {
      organizationId: input.organizationId,
      jobId: input.jobId,
      type: JobActivityType.TASK_DEADLINE_UPDATED,
      title: input.auditTitle,
      details: input.details,
      entityType: "JobTask",
      entityId: input.taskId,
      actorUserId: input.actorUserId,
      metadataJson: input.metadataJson,
    },
    tx,
  );
}

export async function setManualTaskDeadline(
  input: SetManualDeadlineInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | DeadlineServiceError> {
  const task = await loadTaskForDeadline(input.organizationId, input.taskId, tx);
  if (!task) return { error: "Task not found or access denied." };
  if (task.status !== JobTaskStatus.TODO) {
    return { error: "Deadline can only be changed on open tasks." };
  }

  const orgTimezone = getOrgTimezone(task.job.organization.timezone);
  const dueAt = resolveManualDueAt(input, orgTimezone);

  await tx.jobTask.update({
    where: { id: task.id },
    data: {
      dueMode: dueAt ? TaskDueMode.MANUAL : TaskDueMode.NONE,
      dueAt,
      dueGranularity: dueAt ? input.granularity : null,
      dueResolvedAt: dueAt ? new Date() : null,
      dueAnchor: null,
      dueOffsetDays: null,
    },
  });

  await auditDeadlineChange(
    {
      organizationId: input.organizationId,
      jobId: task.jobId,
      taskId: task.id,
      title: task.title,
      actorUserId: input.actorUserId,
      auditTitle: dueAt
        ? `Deadline set: ${task.title}`
        : `Deadline cleared: ${task.title}`,
      details: dueAt
        ? `Manual deadline (${input.granularity}).`
        : "Manual deadline removed.",
      metadataJson: {
        dueMode: dueAt ? TaskDueMode.MANUAL : TaskDueMode.NONE,
        dueAt: dueAt?.toISOString() ?? null,
        dueGranularity: dueAt ? input.granularity : null,
      },
    },
    tx,
  );

  return { success: true };
}

export async function setDerivedDeadlineRule(
  input: SetDerivedRuleInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true } | DeadlineServiceError> {
  const task = await loadTaskForDeadline(input.organizationId, input.taskId, tx);
  if (!task) return { error: "Task not found or access denied." };
  if (task.status !== JobTaskStatus.TODO) {
    return { error: "Deadline rule can only be changed on open tasks." };
  }
  if (input.offsetDays < 0) {
    return { error: "Offset days must be zero or greater." };
  }

  await tx.jobTask.update({
    where: { id: task.id },
    data: {
      dueMode: TaskDueMode.DERIVED,
      dueAnchor: input.anchor,
      dueOffsetDays: input.offsetDays,
      dueGranularity: input.granularity,
    },
  });

  await auditDeadlineChange(
    {
      organizationId: input.organizationId,
      jobId: task.jobId,
      taskId: task.id,
      title: task.title,
      actorUserId: input.actorUserId,
      auditTitle: `Deadline rule set: ${task.title}`,
      details: `${input.offsetDays} day(s) after ${input.anchor}.`,
      metadataJson: {
        dueMode: TaskDueMode.DERIVED,
        dueAnchor: input.anchor,
        dueOffsetDays: input.offsetDays,
        dueGranularity: input.granularity,
      },
    },
    tx,
  );

  return { success: true };
}

export async function recalculateDerivedDeadline(
  input: RecalculateDerivedDeadlineInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ success: true; dueAt: Date } | DeadlineServiceError> {
  const task = await loadTaskForDeadline(input.organizationId, input.taskId, tx);
  if (!task) return { error: "Task not found or access denied." };
  if (task.status !== JobTaskStatus.TODO) {
    return { error: "Deadline can only be recalculated on open tasks." };
  }
  if (task.dueMode !== TaskDueMode.DERIVED) {
    return { error: "Task does not have a derived deadline rule." };
  }
  if (!task.dueAnchor || task.dueOffsetDays === null) {
    return { error: "Derived rule is incomplete." };
  }
  if (!input.reason.trim()) {
    return { error: "A reason is required to recalculate a derived deadline." };
  }

  const firstReadyAt = task.dueFirstReadyAt;
  if (task.dueAnchor === TaskDueAnchor.FIRST_READY && !firstReadyAt) {
    return { error: "Task has not reached first ready yet." };
  }

  const orgTimezone = getOrgTimezone(task.job.organization.timezone);
  const dueAt = computeDerivedDueAt({
    anchor: task.dueAnchor,
    offsetDays: task.dueOffsetDays,
    granularity: task.dueGranularity ?? TaskDueGranularity.EXACT,
    jobActivatedAt: task.job.activatedAt,
    firstReadyAt: firstReadyAt ?? task.job.activatedAt,
    orgTimezone,
  });
  const now = new Date();

  await tx.jobTask.update({
    where: { id: task.id },
    data: {
      dueAt,
      dueResolvedAt: now,
    },
  });

  await auditDeadlineChange(
    {
      organizationId: input.organizationId,
      jobId: task.jobId,
      taskId: task.id,
      title: task.title,
      actorUserId: input.actorUserId,
      auditTitle: `Deadline recalculated: ${task.title}`,
      details: input.reason.trim(),
      metadataJson: {
        dueMode: TaskDueMode.DERIVED,
        dueAt: dueAt.toISOString(),
        reason: input.reason.trim(),
      },
    },
    tx,
  );

  return { success: true, dueAt };
}

export type ResolveDerivedDeadlineInput = {
  organizationId: string;
  taskId: string;
  firstReadyAt: Date;
  actorUserId?: string;
};

/** Resolve-once derived deadline when task first becomes READY (FIRST_READY anchor). */
export async function resolveDerivedDeadlineOnce(
  input: ResolveDerivedDeadlineInput,
  tx: ExtendedTransactionClient = db,
): Promise<{ resolved: boolean; dueAt?: Date }> {
  const task = await loadTaskForDeadline(input.organizationId, input.taskId, tx);
  if (!task) return { resolved: false };
  if (task.status !== JobTaskStatus.TODO) return { resolved: false };
  if (task.dueMode !== TaskDueMode.DERIVED) return { resolved: false };
  if (task.dueResolvedAt) return { resolved: false };
  if (!task.dueAnchor || task.dueOffsetDays === null) return { resolved: false };

  const orgTimezone = getOrgTimezone(task.job.organization.timezone);
  const firstReadyAt = task.dueFirstReadyAt ?? input.firstReadyAt;

  if (task.dueAnchor === TaskDueAnchor.FIRST_READY && !firstReadyAt) {
    return { resolved: false };
  }

  const dueAt = computeDerivedDueAt({
    anchor: task.dueAnchor,
    offsetDays: task.dueOffsetDays,
    granularity: task.dueGranularity ?? TaskDueGranularity.EXACT,
    jobActivatedAt: task.job.activatedAt,
    firstReadyAt: firstReadyAt ?? task.job.activatedAt,
    orgTimezone,
  });
  const now = new Date();

  await tx.jobTask.update({
    where: { id: task.id },
    data: {
      dueAt,
      dueResolvedAt: now,
      dueFirstReadyAt: task.dueFirstReadyAt ?? input.firstReadyAt,
    },
  });

  await auditDeadlineChange(
    {
      organizationId: input.organizationId,
      jobId: task.jobId,
      taskId: task.id,
      title: task.title,
      actorUserId: input.actorUserId,
      auditTitle: `Deadline resolved: ${task.title}`,
      details: "Derived deadline resolved on first qualifying transition.",
      metadataJson: {
        dueMode: TaskDueMode.DERIVED,
        dueAnchor: task.dueAnchor,
        dueOffsetDays: task.dueOffsetDays,
        dueAt: dueAt.toISOString(),
      },
    },
    tx,
  );

  return { resolved: true, dueAt };
}

export type SyncJobDerivedDeadlinesInput = {
  organizationId: string;
  jobId: string;
  actorUserId?: string;
};

/** Resolve pending derived deadlines for tasks that are READY in this job. */
export async function syncDerivedDeadlinesForJob(
  input: SyncJobDerivedDeadlinesInput,
): Promise<{ updatedTaskIds: string[] }> {
  const [tasks, liveSignals, job] = await Promise.all([
    db.jobTask.findMany({
      where: {
        jobId: input.jobId,
        status: JobTaskStatus.TODO,
        dueMode: TaskDueMode.DERIVED,
        dueResolvedAt: null,
        job: { organizationId: input.organizationId },
      },
      select: {
        id: true,
        title: true,
        jobId: true,
        jobStageId: true,
        dueAnchor: true,
        dueOffsetDays: true,
        dueGranularity: true,
        dueFirstReadyAt: true,
        requiresSignals: true,
        status: true,
        issues: {
          where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
          select: { id: true, status: true, severity: true },
        },
        jobStage: {
          select: {
            issues: {
              where: { status: JobIssueStatus.OPEN, severity: JobIssueSeverity.BLOCKS_WORK },
              select: { id: true, status: true, severity: true },
            },
          },
        },
        recoveryFlow: {
          select: { jobIssueId: true },
        },
      },
    }),
    getLiveSignals(input.jobId),
    db.job.findFirst({
      where: { id: input.jobId, organizationId: input.organizationId },
      select: {
        activatedAt: true,
        organization: { select: { timezone: true } },
      },
    }),
  ]);

  if (!job) return { updatedTaskIds: [] };

  const orgTimezone = getOrgTimezone(job.organization.timezone);
  const updatedTaskIds: string[] = [];
  const now = new Date();

  await db.$transaction(async (tx) => {
    for (const task of tasks) {
      const state = deriveTaskState(
        toTaskReadinessInput(task, {
          requiresSignals: [],
          issues: task.jobStage.issues,
        }),
        liveSignals,
        { recoveryFlowIssueId: task.recoveryFlow?.jobIssueId },
      );

      if (task.dueAnchor === TaskDueAnchor.JOB_ACTIVATION) {
        const dueAt = computeDerivedDueAt({
          anchor: TaskDueAnchor.JOB_ACTIVATION,
          offsetDays: task.dueOffsetDays ?? 0,
          granularity: task.dueGranularity ?? TaskDueGranularity.EXACT,
          jobActivatedAt: job.activatedAt,
          firstReadyAt: task.dueFirstReadyAt ?? now,
          orgTimezone,
        });
        await tx.jobTask.update({
          where: { id: task.id },
          data: { dueAt, dueResolvedAt: now },
        });
        await auditDeadlineChange(
          {
            organizationId: input.organizationId,
            jobId: task.jobId,
            taskId: task.id,
            title: task.title,
            actorUserId: input.actorUserId,
            auditTitle: `Deadline resolved: ${task.title}`,
            details: "Derived deadline resolved from job activation anchor.",
            metadataJson: {
              dueMode: TaskDueMode.DERIVED,
              dueAnchor: TaskDueAnchor.JOB_ACTIVATION,
              dueOffsetDays: task.dueOffsetDays,
              dueAt: dueAt.toISOString(),
            },
          },
          tx,
        );
        updatedTaskIds.push(task.id);
        continue;
      }

      if (task.dueAnchor === TaskDueAnchor.FIRST_READY && state === "READY") {
        const result = await resolveDerivedDeadlineOnce(
          {
            organizationId: input.organizationId,
            taskId: task.id,
            firstReadyAt: now,
            actorUserId: input.actorUserId,
          },
          tx,
        );
        if (result.resolved) updatedTaskIds.push(task.id);
      }
    }
  });

  return { updatedTaskIds };
}
