import { getRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import {
  deriveIssueRecoveryRoute,
  type WorkstationRecoveryActionKind,
} from "@/lib/workstation-recovery-routing";
import { IssueRecoveryPanel } from "./issue-recovery-panel";
import { workstationTelemetry } from "@/lib/workstation/telemetry";

type IssueRecoveryDetailLoaderProps = {
  issueId: string;
  actionKind?: WorkstationRecoveryActionKind;
  actionTaskId?: string;
};

export async function IssueRecoveryDetailLoader({
  issueId,
  actionKind: actionKindProp,
}: IssueRecoveryDetailLoaderProps) {
  const ctx = await getRequestContextOrThrow();

  const issue = await db.jobIssue.findFirst({
    where: { id: issueId, organizationId: ctx.organizationId },
    select: {
      id: true,
      jobId: true,
      title: true,
      type: true,
      severity: true,
      status: true,
      description: true,
      createdAt: true,
      jobStage: { select: { title: true } },
      jobTask: { select: { title: true } },
      recoveryFlow: {
        select: {
          id: true,
          status: true,
          tasks: {
            orderBy: { recoveryFlowOrder: "asc" },
            select: {
              id: true,
              title: true,
              status: true,
              recoveryFlowOrder: true,
            },
          },
        },
      },
    },
  });

  if (!issue) return null;

  const route = deriveIssueRecoveryRoute({
    id: issue.id,
    status: issue.status,
    severity: issue.severity,
    recoveryFlow: issue.recoveryFlow
      ? {
          status: issue.recoveryFlow.status,
          tasks: issue.recoveryFlow.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            recoveryFlowOrder: t.recoveryFlowOrder,
          })),
        }
      : null,
  });

  const actionKind = actionKindProp ?? route.actionKind;

  workstationTelemetry.trackRecoveryActionOpened(actionKind, issue.id);

  return (
    <IssueRecoveryPanel
      issue={issue}
      jobId={issue.jobId}
      actionKind={actionKind}
    />
  );
}
