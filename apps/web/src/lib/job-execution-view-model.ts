import {
  JobStatus,
  JobTaskStatus,
  TaskSchedulingRequirement,
  type JobScheduleEventStatus,
} from "@prisma/client";
import {
  buildJobExecutionContextFromJob,
  deriveJobExecutionHealth,
  type BuildJobExecutionContextJobInput,
  type ExecutionHealthResult,
} from "@/lib/job-execution-health";
import {
  type PaymentRequirementRow,
} from "@/lib/job-payment-readiness";
import { includesEquivalentSignal, normalizeSignalKey } from "@/lib/signal-key";
import {
  deriveTaskState,
  toTaskReadinessInput,
  type TaskDerivedState,
  type TaskIssueRef,
} from "@/lib/task-readiness";
import { deriveTaskNeedsScheduling } from "@/lib/scheduling/scheduling-derivation";

export type JobExecutionViewMode = "work" | "flow" | "timeline";

export type JobExecutionViewTaskInput = {
  id: string;
  title: string;
  status: JobTaskStatus;
  category?: string;
  instructions?: string | null;
  completedAt: Date | null;
  completionNote: string | null;
  completionRequirementsJson: unknown;
  dueAt: Date | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  assignedUserId?: string | null;
  workPackageId: string | null;
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  sortOrder: number;
  recoveryFlowId: string | null;
  recoveryFlow?: { jobIssueId: string } | null;
  schedulingRequirement?: TaskSchedulingRequirement;
  attachments: { id: string }[];
  issues: TaskIssueRef[];
  scheduleEventLinks?: Array<{
    jobScheduleEvent: {
      id: string;
      title: string | null;
      status: JobScheduleEventStatus;
      startAt: Date;
      endAt: Date;
    };
  }>;
};

export type JobExecutionViewStageInput = {
  id: string;
  title: string;
  sortOrder: number;
  stageId: string | null;
  issues: TaskIssueRef[];
  tasks: JobExecutionViewTaskInput[];
};

export type JobExecutionViewWorkPackageInput = {
  id: string;
  title: string;
  workType: string | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  tasks: Array<{ id: string; status: JobTaskStatus }>;
};

export type JobExecutionViewScheduleEventInput = {
  id: string;
  title: string | null;
  kind: string;
  status: JobScheduleEventStatus;
  startAt: Date;
  endAt: Date;
  taskLinks: Array<{
    jobTask: { id: string; title: string; status: JobTaskStatus };
  }>;
};

export type BuildJobExecutionViewModelInput = {
  job: {
    id: string;
    status: JobStatus;
    stages: JobExecutionViewStageInput[];
    issues: BuildJobExecutionContextJobInput["issues"];
    paymentRequirements: PaymentRequirementRow[];
  };
  workPackages: JobExecutionViewWorkPackageInput[];
  scheduleEvents: JobExecutionViewScheduleEventInput[];
  liveSignals: string[];
  paymentRequirements: PaymentRequirementRow[];
};

export type JobExecutionViewTask = {
  id: string;
  title: string;
  jobStageId: string;
  stageTitle: string;
  stageSortOrder: number;
  sortOrder: number;
  status: JobTaskStatus;
  derivedState: TaskDerivedState;
  missingSignals: string[];
  providesSignals: string[];
  requiresSignals: string[];
  hardSignal: boolean;
  recoveryFlowId: string | null;
  recoveryFlowIssueId: string | null;
  workPackageId: string | null;
  dueAt: string | null;
  needsScheduling: boolean;
  linkedEvents: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    status: JobScheduleEventStatus;
  }>;
  hasBlockingIssue: boolean;
};

export type JobExecutionFlowEdge = {
  signal: string;
  providerTaskId: string;
  providerTaskTitle: string;
  consumerTaskId: string;
  consumerTaskTitle: string;
  satisfied: boolean;
};

export type JobExecutionFlowOrphan = {
  signal: string;
  isHard: boolean;
  consumerTaskId: string;
  consumerTaskTitle: string;
};

export type JobExecutionFlowNode = {
  taskId: string;
  title: string;
  stageTitle: string;
  stageSortOrder: number;
  sortOrder: number;
  derivedState: TaskDerivedState;
  isRecovery: boolean;
  recoveryFlowIssueId: string | null;
};

export type JobExecutionTimelineSegment = {
  id: string;
  kind: "schedule_event" | "work_package";
  label: string;
  startAt: string;
  endAt: string;
  status?: JobScheduleEventStatus;
};

export type JobExecutionTimelineRow =
  | {
      type: "stage";
      stageId: string;
      title: string;
    }
  | {
      type: "task";
      taskId: string;
      stageId: string;
      title: string;
      derivedState: TaskDerivedState;
      needsScheduling: boolean;
      segments: JobExecutionTimelineSegment[];
      dueAt: string | null;
    };

export type JobExecutionTimelineColumn = {
  key: string;
  label: string;
  startAt: string;
  endAt: string;
};

/** @deprecated Legacy aggregate bars — prefer timeline.rows */
export type JobExecutionTimelineBar = {
  id: string;
  label: string;
  kind: "work_package" | "schedule_event";
  startAt: string;
  endAt: string;
  status?: JobScheduleEventStatus;
  taskIds: string[];
};

/** @deprecated Legacy milestones — prefer timeline.rows */
export type JobExecutionTimelineMilestone = {
  taskId: string;
  title: string;
  dueAt: string;
  derivedState: TaskDerivedState;
};

/** @deprecated Legacy unscheduled list — prefer timeline.rows */
export type JobExecutionTimelineUnscheduledTask = {
  taskId: string;
  title: string;
  stageTitle: string;
  derivedState: TaskDerivedState;
  needsScheduling: boolean;
};

export type JobExecutionTimeline = {
  rangeStart: string;
  rangeEnd: string;
  todayAt: string;
  columns: JobExecutionTimelineColumn[];
  rows: JobExecutionTimelineRow[];
  scheduledTaskCount: number;
  unscheduledTaskCount: number;
  /** Legacy fields kept for tests / gradual migration */
  bars: JobExecutionTimelineBar[];
  milestones: JobExecutionTimelineMilestone[];
  unscheduled: JobExecutionTimelineUnscheduledTask[];
};

export type JobExecutionViewModel = {
  jobId: string;
  summary: {
    totalTasks: number;
    readyCount: number;
    blockedCount: number;
    completedCount: number;
    handshakeCount: number;
    orphanCount: number;
    needsSchedulingCount: number;
  };
  stages: Array<{
    id: string;
    title: string;
    sortOrder: number;
    issues: TaskIssueRef[];
    taskIds: string[];
  }>;
  tasks: JobExecutionViewTask[];
  tasksById: Record<string, JobExecutionViewTask>;
  flow: {
    nodes: JobExecutionFlowNode[];
    edges: JobExecutionFlowEdge[];
    orphans: JobExecutionFlowOrphan[];
  };
  timeline: JobExecutionTimeline;
  health: ExecutionHealthResult;
};

function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function buildTaskViewRow(params: {
  task: JobExecutionViewTaskInput;
  stage: JobExecutionViewStageInput;
  liveSignals: string[];
  now?: Date;
}): JobExecutionViewTask {
  const { task, stage, liveSignals, now = new Date() } = params;
  const readinessInput = toTaskReadinessInput(task, {
    requiresSignals: [],
    issues: stage.issues,
  });
  const derivedState = deriveTaskState(readinessInput, liveSignals, {
    recoveryFlowIssueId: task.recoveryFlow?.jobIssueId,
  });
  const missingSignals = task.requiresSignals.filter(
    (signal) => !includesEquivalentSignal(liveSignals, signal),
  );
  const linkedEvents = (task.scheduleEventLinks ?? []).map((link) => ({
    id: link.jobScheduleEvent.id,
    title: link.jobScheduleEvent.title ?? "Scheduled work",
    startAt: link.jobScheduleEvent.startAt.toISOString(),
    endAt: link.jobScheduleEvent.endAt.toISOString(),
    status: link.jobScheduleEvent.status,
  }));
  const needsScheduling = deriveTaskNeedsScheduling(
    {
      status: task.status,
      derivedState,
      schedulingRequirement:
        task.schedulingRequirement ?? TaskSchedulingRequirement.NONE,
      linkedEvents: linkedEvents.map((event) => ({
        id: event.id,
        status: event.status,
        startAt: new Date(event.startAt),
        endAt: new Date(event.endAt),
      })),
    },
    now,
  );

  return {
    id: task.id,
    title: task.title,
    jobStageId: stage.id,
    stageTitle: stage.title,
    stageSortOrder: stage.sortOrder,
    sortOrder: task.sortOrder,
    status: task.status,
    derivedState,
    missingSignals,
    providesSignals: task.providesSignals,
    requiresSignals: task.requiresSignals,
    hardSignal: task.hardSignal,
    recoveryFlowId: task.recoveryFlowId,
    recoveryFlowIssueId: task.recoveryFlow?.jobIssueId ?? null,
    workPackageId: task.workPackageId,
    dueAt: toIso(task.dueAt),
    needsScheduling,
    linkedEvents,
    hasBlockingIssue: derivedState === "BLOCKED_BY_ISSUE",
  };
}

function buildFlowGraph(tasks: JobExecutionViewTask[]): JobExecutionViewModel["flow"] {
  const providedSignalsMap = new Map<string, JobExecutionViewTask[]>();

  for (const task of tasks) {
    for (const signal of task.providesSignals) {
      const key = normalizeSignalKey(signal);
      const list = providedSignalsMap.get(key) ?? [];
      list.push(task);
      providedSignalsMap.set(key, list);
    }
  }

  const edges: JobExecutionFlowEdge[] = [];
  const orphans: JobExecutionFlowOrphan[] = [];

  for (const consumer of tasks) {
    for (const signal of consumer.requiresSignals) {
      const providers = providedSignalsMap.get(normalizeSignalKey(signal));
      if (providers && providers.length > 0) {
        for (const provider of providers) {
          edges.push({
            signal,
            providerTaskId: provider.id,
            providerTaskTitle: provider.title,
            consumerTaskId: consumer.id,
            consumerTaskTitle: consumer.title,
            satisfied: !consumer.missingSignals.some(
              (missing) => normalizeSignalKey(missing) === normalizeSignalKey(signal),
            ),
          });
        }
      } else {
        orphans.push({
          signal,
          isHard: consumer.hardSignal,
          consumerTaskId: consumer.id,
          consumerTaskTitle: consumer.title,
        });
      }
    }
  }

  const nodes: JobExecutionFlowNode[] = tasks.map((task) => ({
    taskId: task.id,
    title: task.title,
    stageTitle: task.stageTitle,
    stageSortOrder: task.stageSortOrder,
    sortOrder: task.sortOrder,
    derivedState: task.derivedState,
    isRecovery: task.recoveryFlowId != null,
    recoveryFlowIssueId: task.recoveryFlowIssueId,
  }));

  return {
    nodes,
    edges,
    orphans,
  };
}

function buildTimeline(params: {
  tasks: JobExecutionViewTask[];
  stages: JobExecutionViewModel["stages"];
  workPackages: JobExecutionViewWorkPackageInput[];
  scheduleEvents: JobExecutionViewScheduleEventInput[];
  now?: Date;
}): JobExecutionTimeline {
  const { tasks, stages, workPackages, scheduleEvents, now = new Date() } = params;
  const timestamps: number[] = [now.getTime()];
  const pkgById = new Map(workPackages.map((pkg) => [pkg.id, pkg]));

  const bars: JobExecutionTimelineBar[] = [];
  for (const pkg of workPackages) {
    if (pkg.plannedStartDate) timestamps.push(pkg.plannedStartDate.getTime());
    if (pkg.plannedEndDate) timestamps.push(pkg.plannedEndDate.getTime());
    if (pkg.plannedStartDate && pkg.plannedEndDate) {
      bars.push({
        id: `wp-${pkg.id}`,
        label: pkg.title,
        kind: "work_package",
        startAt: pkg.plannedStartDate.toISOString(),
        endAt: pkg.plannedEndDate.toISOString(),
        taskIds: pkg.tasks.map((task) => task.id),
      });
    }
  }

  for (const event of scheduleEvents) {
    timestamps.push(event.startAt.getTime(), event.endAt.getTime());
    bars.push({
      id: `evt-${event.id}`,
      label: event.title ?? "Schedule event",
      kind: "schedule_event",
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      status: event.status,
      taskIds: event.taskLinks.map((link) => link.jobTask.id),
    });
  }

  const milestones: JobExecutionTimelineMilestone[] = [];
  const rows: JobExecutionTimelineRow[] = [];
  let scheduledTaskCount = 0;
  let unscheduledTaskCount = 0;

  const tasksByStage = new Map<string, JobExecutionViewTask[]>();
  for (const task of tasks) {
    const list = tasksByStage.get(task.jobStageId) ?? [];
    list.push(task);
    tasksByStage.set(task.jobStageId, list);
  }

  const stagesSorted = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const stage of stagesSorted) {
    const stageTasks = (tasksByStage.get(stage.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    if (stageTasks.length === 0) continue;

    rows.push({
      type: "stage",
      stageId: stage.id,
      title: stage.title,
    });

    for (const task of stageTasks) {
      const segments: JobExecutionTimelineSegment[] = [];

      if (task.workPackageId) {
        const pkg = pkgById.get(task.workPackageId);
        if (pkg?.plannedStartDate && pkg?.plannedEndDate) {
          timestamps.push(
            pkg.plannedStartDate.getTime(),
            pkg.plannedEndDate.getTime(),
          );
          segments.push({
            id: `wp-${pkg.id}-${task.id}`,
            kind: "work_package",
            label: pkg.title,
            startAt: pkg.plannedStartDate.toISOString(),
            endAt: pkg.plannedEndDate.toISOString(),
          });
        }
      }

      for (const event of task.linkedEvents) {
        timestamps.push(
          new Date(event.startAt).getTime(),
          new Date(event.endAt).getTime(),
        );
        segments.push({
          id: `evt-${event.id}-${task.id}`,
          kind: "schedule_event",
          label: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          status: event.status,
        });
      }

      if (task.dueAt) {
        timestamps.push(new Date(task.dueAt).getTime());
        milestones.push({
          taskId: task.id,
          title: task.title,
          dueAt: task.dueAt,
          derivedState: task.derivedState,
        });
      }

      const hasScheduleData = segments.length > 0 || task.dueAt != null;
      if (hasScheduleData) {
        scheduledTaskCount += 1;
      } else if (task.status === JobTaskStatus.TODO) {
        unscheduledTaskCount += 1;
      }

      rows.push({
        type: "task",
        taskId: task.id,
        stageId: stage.id,
        title: task.title,
        derivedState: task.derivedState,
        needsScheduling: task.needsScheduling,
        segments,
        dueAt: task.dueAt,
      });
    }
  }

  const unscheduled: JobExecutionTimelineUnscheduledTask[] = tasks
    .filter(
      (task) =>
        task.status === JobTaskStatus.TODO &&
        task.linkedEvents.length === 0 &&
        !task.dueAt &&
        !(task.workPackageId && pkgById.get(task.workPackageId)?.plannedStartDate),
    )
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      stageTitle: task.stageTitle,
      derivedState: task.derivedState,
      needsScheduling: task.needsScheduling,
    }));

  const { rangeStart, rangeEnd } = resolveTimelineRange(timestamps, now);
  const columns = buildTimelineColumns(rangeStart, rangeEnd);

  return {
    rangeStart,
    rangeEnd,
    todayAt: now.toISOString(),
    columns,
    rows,
    scheduledTaskCount,
    unscheduledTaskCount,
    bars,
    milestones,
    unscheduled,
  };
}

export function resolveTimelineRange(
  timestamps: number[],
  now: Date,
): { rangeStart: string; rangeEnd: string } {
  if (timestamps.length <= 1) {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() + 42);
    end.setHours(23, 59, 59, 999);
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const paddingMs = 4 * 24 * 60 * 60 * 1000;
  const start = new Date(min - paddingMs);
  start.setHours(0, 0, 0, 0);
  const end = new Date(max + paddingMs);
  end.setHours(23, 59, 59, 999);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

export function buildTimelineColumns(
  rangeStart: string,
  rangeEnd: string,
): JobExecutionTimelineColumn[] {
  const startMs = new Date(rangeStart).getTime();
  const endMs = new Date(rangeEnd).getTime();
  const spanDays = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));
  const stepDays = spanDays <= 21 ? 1 : spanDays <= 90 ? 7 : 14;

  const columns: JobExecutionTimelineColumn[] = [];
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= endMs) {
    const colStart = new Date(cursor);
    const colEnd = new Date(cursor);
    colEnd.setDate(colEnd.getDate() + stepDays);
    colEnd.setMilliseconds(colEnd.getMilliseconds() - 1);

    const label =
      stepDays === 1
        ? colStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : `${colStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

    columns.push({
      key: colStart.toISOString().slice(0, 10),
      label,
      startAt: colStart.toISOString(),
      endAt: colEnd.toISOString(),
    });

    cursor.setDate(cursor.getDate() + stepDays);
  }

  return columns.length > 0 ? columns : [{
    key: rangeStart.slice(0, 10),
    label: "Today",
    startAt: rangeStart,
    endAt: rangeEnd,
  }];
}

export function timelinePositionPercent(
  iso: string,
  rangeStart: string,
  rangeEnd: string,
): number {
  const start = new Date(rangeStart).getTime();
  const end = new Date(rangeEnd).getTime();
  const span = Math.max(end - start, 1);
  const point = new Date(iso).getTime();
  return Math.max(0, Math.min(100, ((point - start) / span) * 100));
}

export function timelineBarLayout(
  startAt: string,
  endAt: string,
  rangeStart: string,
  rangeEnd: string,
): { left: number; width: number } {
  const left = timelinePositionPercent(startAt, rangeStart, rangeEnd);
  const right = timelinePositionPercent(endAt, rangeStart, rangeEnd);
  const width = Math.max(1.5, Math.min(100 - left, right - left));
  return { left, width };
}

export function buildJobExecutionViewModel(
  input: BuildJobExecutionViewModelInput,
  now: Date = new Date(),
): JobExecutionViewModel {
  const { job, workPackages, scheduleEvents, liveSignals } = input;

  const tasks: JobExecutionViewTask[] = [];
  for (const stage of job.stages) {
    for (const task of stage.tasks) {
      tasks.push(
        buildTaskViewRow({
          task,
          stage,
          liveSignals,
          now,
        }),
      );
    }
  }

  const tasksById = Object.fromEntries(tasks.map((task) => [task.id, task]));
  const flow = buildFlowGraph(tasks);
  const timeline = buildTimeline({
    tasks,
    stages: job.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      sortOrder: stage.sortOrder,
      issues: stage.issues,
      taskIds: stage.tasks.map((task) => task.id),
    })),
    workPackages,
    scheduleEvents,
    now,
  });

  const health = deriveJobExecutionHealth(
    buildJobExecutionContextFromJob(
      {
        id: job.id,
        status: job.status,
        stages: job.stages.map((stage) => ({
          id: stage.id,
          title: stage.title,
          sortOrder: stage.sortOrder,
          stageId: stage.stageId,
          issues: stage.issues,
          tasks: stage.tasks.map((task) => ({
            id: task.id,
            status: task.status,
            completedAt: task.completedAt,
            completionNote: task.completionNote,
            completionRequirementsJson: task.completionRequirementsJson,
            attachments: task.attachments,
            requiresSignals: task.requiresSignals,
            recoveryFlowId: task.recoveryFlowId,
            recoveryFlowOrder: 0,
            sortOrder: task.sortOrder,
            issues: task.issues,
            recoveryFlow: task.recoveryFlow,
          })),
        })),
        issues: job.issues,
        paymentRequirements: job.paymentRequirements,
      },
      liveSignals,
    ),
  );

  const readyCount = tasks.filter((t) => t.derivedState === "READY" || t.derivedState === "NEEDS_PROOF").length;
  const blockedCount = tasks.filter(
    (t) => t.derivedState === "BLOCKED_BY_ISSUE" || t.derivedState === "BLOCKED_BY_SIGNAL",
  ).length;
  const completedCount = tasks.filter((t) => t.derivedState === "COMPLETED").length;

  return {
    jobId: job.id,
    summary: {
      totalTasks: tasks.length,
      readyCount,
      blockedCount,
      completedCount,
      handshakeCount: flow.edges.length,
      orphanCount: flow.orphans.length,
      needsSchedulingCount: tasks.filter((t) => t.needsScheduling).length,
    },
    stages: job.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      sortOrder: stage.sortOrder,
      issues: stage.issues,
      taskIds: stage.tasks.map((task) => task.id),
    })),
    tasks,
    tasksById,
    flow,
    timeline,
    health,
  };
}

export function parseJobExecutionViewMode(
  value: string | string[] | undefined,
): JobExecutionViewMode {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
  if (raw === "flow" || raw === "timeline") return raw;
  return "work";
}
