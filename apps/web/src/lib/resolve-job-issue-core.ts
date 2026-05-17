import {
  JobActivityType,
  JobIssueStatus,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import { recordJobActivity } from "@/lib/job-activity-helper";
import type { ExtendedTransactionClient } from "@/lib/db";

export type ResolveJobIssueMode = "standard" | "resume" | "force";

type IssueWithRecovery = {
  id: string;
  jobId: string;
  title: string;
  recoveryFlow: {
    id: string;
    status: JobRecoveryFlowStatus;
    tasks: { id: string; status: JobTaskStatus }[];
  } | null;
};

export function recoveryFlowHasIncompleteTasks(
  flow: NonNullable<IssueWithRecovery["recoveryFlow"]>,
): boolean {
  if (flow.tasks.length === 0) return true;
  return flow.tasks.some((t) => t.status !== JobTaskStatus.DONE);
}

export function assertCanResolveIssue(
  issue: IssueWithRecovery,
  mode: ResolveJobIssueMode,
): void {
  const flow = issue.recoveryFlow;
  if (!flow) return;

  const isOpenFlow =
    flow.status === JobRecoveryFlowStatus.DRAFT ||
    flow.status === JobRecoveryFlowStatus.ACTIVE;

  if (!isOpenFlow) return;

  const incomplete = recoveryFlowHasIncompleteTasks(flow);

  if (mode === "force") return;

  if (mode === "resume") {
    if (incomplete) {
      throw new Error(
        "Complete all recovery steps before resuming the original path.",
      );
    }
    return;
  }

  if (incomplete) {
    throw new Error(
      "This issue has an open recovery flow with incomplete steps. Complete recovery and use Resume, or force resolve.",
    );
  }
}

export async function resolveJobIssueWithRecoveryHandling(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    issue: IssueWithRecovery;
    resolutionNote?: string;
    mode: ResolveJobIssueMode;
    actorUserId: string;
  },
): Promise<void> {
  const { organizationId, issue, resolutionNote, mode, actorUserId } = params;

  assertCanResolveIssue(issue, mode);

  await tx.jobIssue.update({
    where: { id: issue.id },
    data: {
      status: JobIssueStatus.RESOLVED,
      resolutionNote: resolutionNote?.trim() || null,
      resolvedAt: new Date(),
    },
  });

  const flow = issue.recoveryFlow;
  const isOpenFlow =
    flow &&
    (flow.status === JobRecoveryFlowStatus.DRAFT ||
      flow.status === JobRecoveryFlowStatus.ACTIVE);

  if (mode === "force" && isOpenFlow && flow) {
    await tx.jobRecoveryFlow.update({
      where: { id: flow.id },
      data: { status: JobRecoveryFlowStatus.CANCELLED },
    });

    await recordJobActivity(
      {
        organizationId,
        jobId: issue.jobId,
        type: JobActivityType.ISSUE_RESOLVED,
        title: `Issue force resolved: ${issue.title}`,
        details: resolutionNote?.trim() || "Recovery flow cancelled; steps not completed.",
        entityType: "JobIssue",
        entityId: issue.id,
        actorUserId,
        metadataJson: {
          forced: true,
          recoveryFlowId: flow.id,
          recoveryFlowStatus: JobRecoveryFlowStatus.CANCELLED,
        },
      },
      tx,
    );
    return;
  }

  const recoveryCompleteAndOpenFlow =
    isOpenFlow &&
    flow &&
    !recoveryFlowHasIncompleteTasks(flow);

  if (
    (mode === "resume" || mode === "standard") &&
    recoveryCompleteAndOpenFlow
  ) {
    await tx.jobRecoveryFlow.update({
      where: { id: flow.id },
      data: { status: JobRecoveryFlowStatus.COMPLETED },
    });

    await recordJobActivity(
      {
        organizationId,
        jobId: issue.jobId,
        type: JobActivityType.RECOVERY_FLOW_COMPLETED,
        title: `Recovery complete — original path resumed: ${issue.title}`,
        details:
          resolutionNote?.trim() ||
          "Issue resolved; recovery flow completed; original execution path resumed.",
        entityType: "JobIssue",
        entityId: issue.id,
        actorUserId,
        metadataJson: {
          issueResolved: true,
          recoveryFlowId: flow.id,
          recoveryFlowStatus: JobRecoveryFlowStatus.COMPLETED,
          originalPathResumed: true,
        },
      },
      tx,
    );
    return;
  }

  await recordJobActivity(
    {
      organizationId,
      jobId: issue.jobId,
      type: JobActivityType.ISSUE_RESOLVED,
      title: `Issue resolved: ${issue.title}`,
      details: resolutionNote?.trim() || undefined,
      entityType: "JobIssue",
      entityId: issue.id,
      actorUserId,
    },
    tx,
  );
}
