"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import { CheckCircle2 } from "lucide-react";
import { resolveIssueAndResumeAction } from "@/app/(workspace)/jobs/recovery-actions";
import {
  formatJobIssueSeverity,
  formatJobIssueType,
} from "@/lib/job-issue-display";
import { formatJobTaskStatus, jobTaskStatusBadgeTone } from "@/lib/job-display";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  RecoveryFlowBuilder,
  type RecoveryBuilderContext,
} from "@/components/jobs/recovery-flow-builder";
import type { WorkstationRecoveryActionKind } from "@/lib/workstation-recovery-routing";
import { workstationTelemetry } from "@/lib/workstation/telemetry";

export type IssueRecoveryPanelIssue = {
  id: string;
  title: string;
  type: JobIssueType;
  severity: JobIssueSeverity;
  status: JobIssueStatus;
  description: string | null;
  createdAt: Date;
  jobStage?: { title: string } | null;
  jobTask?: { title: string } | null;
  recoveryFlow?: {
    id: string;
    status: JobRecoveryFlowStatus;
    tasks: {
      id: string;
      title: string;
      status: JobTaskStatus;
    }[];
  } | null;
};

type IssueRecoveryPanelProps = {
  issue: IssueRecoveryPanelIssue;
  jobId: string;
  actionKind: WorkstationRecoveryActionKind;
};

export function IssueRecoveryPanel({
  issue,
  jobId,
  actionKind,
}: IssueRecoveryPanelProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isResuming, startResume] = useTransition();

  const recoveryContext: RecoveryBuilderContext = {
    sourceTaskTitle: issue.jobTask?.title ?? issue.jobStage?.title ?? null,
    issueTitle: issue.title,
    issueSeverityLabel: formatJobIssueSeverity(issue.severity),
    issueTypeLabel: formatJobIssueType(issue.type),
    recoveryGoal: `Resolve "${issue.title}" and resume the blocked path.`,
  };

  const recoveryTasks = issue.recoveryFlow?.tasks ?? [];
  const showPlanner =
    actionKind === "plan-recovery" &&
    (!issue.recoveryFlow ||
      issue.recoveryFlow.status === JobRecoveryFlowStatus.DRAFT ||
      issue.recoveryFlow.status === JobRecoveryFlowStatus.CANCELLED);

  const handleResume = () => {
    startResume(async () => {
      try {
        await resolveIssueAndResumeAction(issue.id, note.trim() || undefined);
        workstationTelemetry.trackRecoveryResumeFromWs(issue.id);
        router.refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to resume path");
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {issue.description ? (
          <p className="text-sm leading-relaxed text-foreground-muted">
            {issue.description}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-[0.65rem] text-foreground-subtle">
          <StatusBadge
            label={formatJobIssueType(issue.type)}
            tone="neutral"
            className="text-[0.65rem]"
          />
          <span>Recorded {new Date(issue.createdAt).toLocaleDateString()}</span>
          {(issue.jobStage || issue.jobTask) && (
            <span>
              Linked to{" "}
              <span className="font-medium text-foreground">
                {issue.jobTask?.title || issue.jobStage?.title}
              </span>
            </span>
          )}
        </div>
      </div>

      {recoveryTasks.length > 0 && (
        <div className="space-y-2 border-t border-border pt-6">
          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
            Recovery path
          </p>
          <div className="space-y-1.5">
            {recoveryTasks.map((task, idx) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-foreground/[0.01] px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[10px] font-bold text-foreground-subtle">
                    {idx + 1}
                  </span>
                  <span
                    className={`truncate text-sm ${
                      task.status === JobTaskStatus.DONE
                        ? "text-foreground-subtle line-through"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
                <StatusBadge
                  label={formatJobTaskStatus(task.status)}
                  tone={jobTaskStatusBadgeTone(task.status)}
                  className="text-[0.55rem] px-1.5 py-0"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showPlanner && (
        <div className="border-t border-border pt-6">
          <RecoveryFlowBuilder
            issueId={issue.id}
            jobId={jobId}
            context={recoveryContext}
            onSuccess={() => {
              workstationTelemetry.trackRecoveryActionOpened("plan-recovery", issue.id);
              router.refresh();
            }}
            onCancel={() => router.refresh()}
          />
        </div>
      )}

      {actionKind === "plan-recovery" &&
        issue.recoveryFlow?.status === JobRecoveryFlowStatus.ACTIVE &&
        recoveryTasks.some((t) => t.status !== JobTaskStatus.DONE) && (
          <p className="text-sm text-foreground-muted">
            Recovery is in progress. Complete the active recovery step from this
            panel or re-open the issue card after refreshing.
          </p>
        )}

      {actionKind === "resume-original-path" && (
        <div className="space-y-4 border-t border-border pt-6">
          <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/[0.03] p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Recovery complete
              </p>
              <p className="text-sm text-foreground-muted">
                Resolve this issue to unblock the original job path.
              </p>
            </div>
          </div>
          <label className="block space-y-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-foreground-subtle">
              Resolution note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was done to clear this blocker?"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
              rows={3}
            />
          </label>
          <button
            type="button"
            onClick={handleResume}
            disabled={isResuming}
            className="inline-flex w-full items-center justify-center rounded-lg bg-success px-4 py-3 text-sm font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isResuming ? "Resuming…" : "Resume original path"}
          </button>
        </div>
      )}
    </div>
  );
}
