"use client";

import { useState, useTransition } from "react";
import {
  JobIssueSeverity,
  JobIssueStatus,
  JobIssueType,
  JobRecoveryFlowStatus,
  JobTaskStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from "lucide-react";
import {
  createJobIssueAction,
  forceResolveJobIssueAction,
  resolveJobIssueAction,
} from "@/app/(workspace)/jobs/job-issue-actions";
import { resolveIssueAndResumeAction } from "@/app/(workspace)/jobs/recovery-actions";
import {
  formatJobIssueSeverity,
  formatJobIssueStatus,
  formatJobIssueType,
  jobIssueSeverityBadgeTone,
  jobIssueStatusBadgeTone,
} from "@/lib/job-issue-display";
import { formatJobTaskStatus, jobTaskStatusBadgeTone } from "@/lib/job-display";
import { SectionHeading } from "@/components/ui/section-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { RecoveryFlowBuilder, type RecoveryBuilderContext } from "./recovery-flow-builder";

type Issue = {
  id: string;
  title: string;
  type: JobIssueType;
  severity: JobIssueSeverity;
  status: JobIssueStatus;
  description: string | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  jobStage?: { title: string } | null;
  jobTask?: { title: string } | null;
  recoveryFlow?: {
    id: string;
    status: string;
    tasks: {
      id: string;
      title: string;
      status: string;
    }[];
  } | null;
};

export function JobIssueManager({
  jobId,
  initialIssues,
  stages,
}: {
  jobId: string;
  initialIssues: Issue[];
  stages: { id: string; title: string; tasks: { id: string; title: string }[] }[];
}) {
  const [isAdding, setIsAdding] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const openIssues = initialIssues.filter((i) => i.status === JobIssueStatus.OPEN);
  const resolvedIssues = initialIssues.filter((i) => i.status !== JobIssueStatus.OPEN);

  const handleResolve = async (issueId: string, resolutionNote?: string) => {
    startTransition(async () => {
      try {
        await resolveJobIssueAction({ issueId, resolutionNote });
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to resolve issue");
      }
    });
  };

  return (
    <section className="mb-8">
      <SectionHeading
        title="Job Issues"
        description="Track and resolve construction blockers, delays, or site conditions."
        actions={
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground"
          >
            {isAdding ? (
              <>
                <X className="size-3.5" /> Cancel
              </>
            ) : (
              <>
                <Plus className="size-3.5" /> Record issue
              </>
            )}
          </button>
        }
      />

      {isAdding && (
        <WorkspacePanel className="mb-6 border-dashed border-border-strong bg-foreground/[0.01]">
          <CreateIssueForm
            jobId={jobId}
            stages={stages}
            onSuccess={() => setIsAdding(false)}
            onCancel={() => setIsAdding(false)}
          />
        </WorkspacePanel>
      )}

      <div className="space-y-4">
        {openIssues.length === 0 && !isAdding && (
          <p className="py-4 text-center text-xs text-foreground-muted">
            No open issues on this job.
          </p>
        )}

        {openIssues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onResolve={(note) => handleResolve(issue.id, note)}
            isPending={isPending}
            jobId={jobId}
          />
        ))}

        {resolvedIssues.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowResolved(!showResolved)}
              className="flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-subtle hover:text-foreground"
            >
              {showResolved ? (
                <ChevronUp className="size-3" />
              ) : (
                <ChevronDown className="size-3" />
              )}
              {showResolved ? "Hide" : "Show"} {resolvedIssues.length} resolved issues
            </button>
            
            {showResolved && (
              <div className="mt-4 space-y-3 opacity-70 transition-opacity hover:opacity-100">
                {resolvedIssues.map((issue) => (
                  <IssueCard key={issue.id} issue={issue} isResolved jobId={jobId} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function IssueCard({
  issue,
  onResolve,
  isPending,
  isResolved,
  jobId,
}: {
  issue: Issue;
  onResolve?: (note?: string) => void;
  isPending?: boolean;
  isResolved?: boolean;
  jobId: string;
}) {
  const [isResolving, setIsResolving] = useState(false);
  const [isBuildingFlow, setIsBuildingFlow] = useState(false);
  const [note, setNote] = useState("");
  const [isResuming, setIsResuming] = useState(false);
  const [isForceResolving, setIsForceResolving] = useState(false);
  const recoveryContext: RecoveryBuilderContext = {
    sourceTaskTitle: issue.jobTask?.title ?? issue.jobStage?.title ?? null,
    issueTitle: issue.title,
    issueSeverityLabel: formatJobIssueSeverity(issue.severity),
    issueTypeLabel: formatJobIssueType(issue.type),
    recoveryGoal: `Resolve "${issue.title}" and resume the blocked path.`,
  };

  const hasRecoveryFlow = !!issue.recoveryFlow;
  const recoveryTasks = issue.recoveryFlow?.tasks || [];
  const allRecoveryTasksDone =
    recoveryTasks.length > 0 &&
    recoveryTasks.every((t) => t.status === JobTaskStatus.DONE);
  const isOpenRecoveryFlow =
    !!issue.recoveryFlow &&
    (issue.recoveryFlow.status === JobRecoveryFlowStatus.DRAFT ||
      issue.recoveryFlow.status === JobRecoveryFlowStatus.ACTIVE);
  const recoveryIncomplete =
    isOpenRecoveryFlow &&
    (recoveryTasks.length === 0 ||
      recoveryTasks.some((t) => t.status !== JobTaskStatus.DONE));

  const handleResume = async () => {
    setIsResuming(true);
    try {
      await resolveIssueAndResumeAction(issue.id, note || undefined);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to resume path");
    } finally {
      setIsResuming(false);
    }
  };

  const forceResolveNote = note.trim();

  const handleForceResolve = async () => {
    if (!forceResolveNote) return;
    if (
      !confirm(
        "Force resolve will cancel the recovery flow without completing its steps. The issue will be marked resolved. Continue?",
      )
    ) {
      return;
    }
    setIsForceResolving(true);
    try {
      await forceResolveJobIssueAction({
        issueId: issue.id,
        resolutionNote: forceResolveNote,
      });
      setIsResolving(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to force resolve issue");
    } finally {
      setIsForceResolving(false);
    }
  };

  return (
    <div
      className={`rounded-lg border px-4 py-4 shadow-sm transition-all ${
        isResolved
          ? "border-border bg-surface/50"
          : issue.severity === JobIssueSeverity.BLOCKS_WORK
            ? "border-danger/20 bg-danger/[0.02] ring-1 ring-danger/10"
            : "border-border-strong bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {issue.severity === JobIssueSeverity.BLOCKS_WORK && !isResolved && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-danger" aria-hidden />
                <span className="text-[10px] font-bold uppercase tracking-wider text-danger">Mutes signals</span>
              </div>
            )}
            <h3 className="text-sm font-semibold text-foreground">
              {issue.title}
            </h3>
            <StatusBadge
              label={formatJobIssueType(issue.type)}
              tone="neutral"
              className="text-[0.65rem]"
            />
            {!isResolved && (
              <StatusBadge
                label={formatJobIssueSeverity(issue.severity)}
                tone={jobIssueSeverityBadgeTone(issue.severity)}
                className="text-[0.65rem]"
              />
            )}
            <StatusBadge
              label={formatJobIssueStatus(issue.status)}
              tone={jobIssueStatusBadgeTone(issue.status)}
              className="text-[0.65rem]"
            />
          </div>

          <div className="mt-2 space-y-1">
            {issue.description && (
              <p className="text-xs leading-relaxed text-foreground-muted">
                {issue.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-foreground-subtle">
              <span>
                Recorded {new Date(issue.createdAt).toLocaleDateString()}
              </span>
              {(issue.jobStage || issue.jobTask) && (
                <span className="flex items-center gap-1">
                  • Linked to:{" "}
                  <span className="font-medium text-foreground">
                    {issue.jobTask?.title || issue.jobStage?.title}
                  </span>
                </span>
              )}
            </div>
          </div>

          {recoveryTasks.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">
                Recovery Path
              </p>
              <div className="space-y-1.5">
                {recoveryTasks.map((t, idx) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-foreground/[0.01] px-2 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-foreground-subtle">{idx + 1}</span>
                      <span className={`truncate text-xs ${t.status === JobTaskStatus.DONE ? "text-foreground-subtle line-through" : "text-foreground font-medium"}`}>
                        {t.title}
                      </span>
                    </div>
                    <StatusBadge
                      label={formatJobTaskStatus(t.status as JobTaskStatus)}
                      tone={jobTaskStatusBadgeTone(t.status as JobTaskStatus)}
                      className="text-[0.55rem] px-1.5 py-0"
                    />
                  </div>
                ))}
              </div>

              {issue.status === JobIssueStatus.OPEN &&
                allRecoveryTasksDone &&
                !isResolving && (
                  <div className="mt-3 flex items-center justify-between rounded-md border border-success/20 bg-success/[0.02] px-3 py-2">
                    <p className="text-[0.65rem] font-medium text-success">
                      Recovery flow complete. Resume original path?
                    </p>
                    <button
                      onClick={handleResume}
                      disabled={isResuming}
                      className="rounded bg-success/20 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-success hover:bg-success/30 disabled:opacity-50"
                    >
                      {isResuming ? "Resuming..." : "Resume Now"}
                    </button>
                  </div>
                )}
            </div>
          )}

          {isResolved && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-[0.65rem] font-medium text-success">
                <CheckCircle2 className="size-3.5" />
                <span>
                  Resolved {issue.resolvedAt ? new Date(issue.resolvedAt).toLocaleDateString() : ""}
                </span>
              </div>
              {issue.resolutionNote && (
                <p className="mt-1 text-xs italic text-foreground-muted">
                  “{issue.resolutionNote}”
                </p>
              )}
            </div>
          )}

          {isBuildingFlow && (
            <div className="mt-4 border-t border-border pt-4">
              <RecoveryFlowBuilder
                issueId={issue.id}
                jobId={jobId}
                context={recoveryContext}
                onSuccess={() => setIsBuildingFlow(false)}
                onCancel={() => setIsBuildingFlow(false)}
              />
            </div>
          )}
        </div>

        {!isResolved && !isBuildingFlow && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex gap-2">
              {!hasRecoveryFlow && (
                <button
                  onClick={() => setIsBuildingFlow(true)}
                  disabled={isPending}
                  className="rounded-md border border-border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50"
                >
                  Create Recovery Path
                </button>
              )}
              {recoveryIncomplete ? (
                <div className="max-w-xs text-right">
                  <p className="mb-2 text-[0.65rem] leading-relaxed text-foreground-muted">
                    Complete recovery steps, then use Resume. Or force resolve to cancel recovery.
                  </p>
                  {!isResolving ? (
                    <button
                      onClick={() => setIsResolving(true)}
                      disabled={isPending || isForceResolving}
                      className="rounded-md border border-danger/30 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-danger transition-colors hover:border-danger/50 hover:bg-danger/[0.04] disabled:opacity-50"
                    >
                      Force resolve
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <label className="text-left text-[0.65rem] font-medium text-foreground-muted">
                        Resolution note <span className="text-danger">*</span>
                      </label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Why are you cancelling recovery?"
                        required
                        aria-required
                        className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setIsResolving(false)}
                          className="text-[0.65rem] font-medium text-foreground-muted hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleForceResolve}
                          disabled={isPending || isForceResolving || !forceResolveNote}
                          className="rounded bg-danger px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-background hover:bg-danger/90 disabled:opacity-50"
                        >
                          {isForceResolving ? "Saving..." : "Confirm force"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : allRecoveryTasksDone && isOpenRecoveryFlow ? (
                <button
                  onClick={handleResume}
                  disabled={isResuming || isPending}
                  className="rounded-md border border-success/30 bg-success/[0.04] px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-success transition-colors hover:border-success/50 disabled:opacity-50"
                >
                  {isResuming ? "Resuming…" : "Resume original path"}
                </button>
              ) : !isResolving ? (
                <button
                  onClick={() => setIsResolving(true)}
                  disabled={isPending}
                  className="rounded-md border border-border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50"
                >
                  Resolve
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Resolution note (optional)"
                    className="w-48 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
                    rows={2}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsResolving(false)}
                      className="text-[0.65rem] font-medium text-foreground-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => onResolve?.(note)}
                      disabled={isPending}
                      className="rounded bg-foreground px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-background hover:bg-foreground/90 disabled:opacity-50"
                    >
                      {isPending ? "Saving..." : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateIssueForm({
  jobId,
  stages,
  onSuccess,
  onCancel,
}: {
  jobId: string;
  stages: { id: string; title: string; tasks: { id: string; title: string }[] }[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState<{
    title: string;
    type: JobIssueType;
    severity: JobIssueSeverity;
    description: string;
    jobStageId: string;
    jobTaskId: string;
  }>({
    title: "",
    type: JobIssueType.OTHER,
    severity: JobIssueSeverity.BLOCKS_WORK,
    description: "",
    jobStageId: "",
    jobTaskId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    startTransition(async () => {
      try {
        await createJobIssueAction({
          jobId,
          title: formData.title,
          type: formData.type,
          severity: formData.severity,
          description: formData.description || undefined,
          jobStageId: formData.jobStageId || undefined,
          jobTaskId: formData.jobTaskId || undefined,
        });
        onSuccess();
      } catch (error) {
        alert(error instanceof Error ? error.message : "Failed to create issue");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
            Issue Title
          </label>
          <input
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Inspection failed at main panel"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value as JobIssueType })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
            >
              {Object.values(JobIssueType).map((t) => (
                <option key={t} value={t}>
                  {formatJobIssueType(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
              Severity
            </label>
            <select
              value={formData.severity}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  severity: e.target.value as JobIssueSeverity,
                })
              }
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
            >
              {Object.values(JobIssueSeverity).map((s) => (
                <option key={s} value={s}>
                  {formatJobIssueSeverity(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
          Description (Optional)
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Add details about the issue..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted/50 focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
          rows={2}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
            Link to Stage (Optional)
          </label>
          <select
            value={formData.jobStageId}
            onChange={(e) => setFormData({ ...formData, jobStageId: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
          >
            <option value="">Not linked to stage</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground-subtle">
            Link to Task (Optional)
          </label>
          <select
            value={formData.jobTaskId}
            onChange={(e) => setFormData({ ...formData, jobTaskId: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-ring/20"
          >
            <option value="">Not linked to task</option>
            {stages
              .flatMap((s) => s.tasks)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-foreground-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending || !formData.title}
          className="rounded-lg bg-foreground px-4 py-2 text-xs font-bold uppercase tracking-wider text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Recording..." : "Record Issue"}
        </button>
      </div>
    </form>
  );
}
