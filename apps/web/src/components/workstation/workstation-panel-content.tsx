import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { JobIssueSeverity, JobIssueStatus } from "@prisma/client";
import { TaskWorkSurface } from "@/components/jobs/task-work-surface";
import { loadJobTaskExecutionPayload } from "@/lib/job-task-execution-loader";
import { WorkstationJobPanel } from "@/components/workstation/workstation-job-panel";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import { IssueRecoveryDetailLoader } from "./issue-recovery-detail-loader";

export async function WorkstationPanelContent({
  item,
}: {
  item: WorkstationWorkItem;
}) {
  if (item.actionKind === "do-recovery-task" && item.actionTaskId) {
    return <WorkstationTaskDetail taskId={item.actionTaskId} />;
  }

  if (
    item.actionKind === "plan-recovery" ||
    item.actionKind === "resume-original-path" ||
    (item.kind === "investigate" && item.filterCategory === "issues")
  ) {
    return (
      <IssueRecoveryDetailLoader
        issueId={item.actionIssueId ?? item.recordId}
        actionKind={item.actionKind}
        actionTaskId={item.actionTaskId}
      />
    );
  }

  if (item.kind === "investigate" && item.id.startsWith("job-health-")) {
    return <WorkstationJobDetail jobId={item.recordId} />;
  }

  if (item.kind === "task") {
    return <WorkstationTaskDetail taskId={item.recordId} />;
  }

  if (item.kind === "job") {
    return <WorkstationJobDetail jobId={item.recordId} />;
  }

  return null;
}

async function WorkstationTaskDetail({ taskId }: { taskId: string }) {
  const ctx = await getRequestContextOrThrow();
  const payload = await loadJobTaskExecutionPayload(taskId, ctx.organizationId);

  if (!payload) return null;

  const { getLiveSignals } = await import("@/lib/signal-bus");
  const liveSignals = await getLiveSignals(payload.jobId);

  return (
    <TaskWorkSurface
      {...payload}
      liveSignals={liveSignals}
      clearWorkstationSelectionOnComplete
    />
  );
}

async function WorkstationJobDetail({ jobId }: { jobId: string }) {
  const ctx = await getRequestContextOrThrow();
  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: ctx.organizationId },
    include: {
      stages: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          sortOrder: true,
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            select: { id: true, status: true, severity: true },
          },
        },
      },
      tasks: {
        where: { completedAt: null },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          status: true,
          completedAt: true,
          completionNote: true,
          completionRequirementsJson: true,
          requiresSignals: true,
          attachments: {
            where: { status: "READY" },
            select: { id: true },
          },
          issues: {
            where: {
              status: JobIssueStatus.OPEN,
              severity: JobIssueSeverity.BLOCKS_WORK,
            },
            select: { id: true, status: true, severity: true },
          },
          recoveryFlow: { select: { jobIssueId: true } },
          jobStage: {
            select: {
              id: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  if (!job) return null;

  const { getLiveSignals } = await import("@/lib/signal-bus");
  const { deriveTaskState, toTaskReadinessInput } = await import("@/lib/task-readiness");
  const liveSignals = await getLiveSignals(job.id);

  const stageIssuesByJobStageId = new Map(
    job.stages.map((s) => [s.id, s.issues] as const),
  );

  const sortedTasks = [...job.tasks].sort((a, b) => {
    if (a.jobStage.sortOrder !== b.jobStage.sortOrder) {
      return a.jobStage.sortOrder - b.jobStage.sortOrder;
    }
    return a.sortOrder - b.sortOrder;
  });

  const nextReadyTask = sortedTasks.find((task) => {
    const { jobStage, recoveryFlow, ...readinessTask } = task;
    const readinessInput = toTaskReadinessInput(readinessTask, {
      requiresSignals: [],
      issues: stageIssuesByJobStageId.get(jobStage.id) ?? [],
    });
    const state = deriveTaskState(readinessInput, liveSignals, {
      recoveryFlowIssueId: recoveryFlow?.jobIssueId,
    });
    return state === "READY" || state === "NEEDS_PROOF";
  });

  const stageCount = job.stages.length;
  const activeTaskCount = await db.jobTask.count({
    where: {
      jobId: job.id,
      completedAt: null,
      job: { organizationId: ctx.organizationId },
    },
  });

  return (
    <WorkstationJobPanel
      stageCount={stageCount}
      taskCount={activeTaskCount}
      nextTaskTitle={nextReadyTask?.title ?? sortedTasks[0]?.title}
    />
  );
}
