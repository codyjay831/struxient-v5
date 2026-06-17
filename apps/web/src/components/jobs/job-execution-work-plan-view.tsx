import Link from "next/link";
import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { JobTaskCard } from "@/components/jobs/job-task-card";
import { JobTaskAddButton } from "@/components/jobs/job-task-add-button";
import { CORRECTIONS_STAGE_NAME, type TaskPaymentHold } from "@/lib/job-payment-readiness";
import type { JobTaskExecutionTask } from "@/components/jobs/job-task-execution-types";
import type { TaskIssueRef } from "@/lib/task-readiness";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

type StageIssue = {
  id: string;
  title: string;
  jobTask?: { title: string } | null;
  jobStage?: { title: string } | null;
  recoveryFlow?: {
    tasks: Array<{ id: string }>;
  } | null;
};

type StageRow = {
  id: string;
  title: string;
  issues: TaskIssueRef[];
  tasks: JobTaskExecutionTask[];
};

export function JobExecutionEmptyState({
  quoteHref,
}: {
  quoteHref: string | null;
}) {
  return (
    <WorkspacePanel>
      <EmptyState
        icon={Briefcase}
        title="No execution stages on this job"
        description="No stages were copied at activation. Open the source quote to review execution planning before adding work here."
      >
        {quoteHref ? (
          <Link href={quoteHref} className={listLinkClass}>
            Open source quote
          </Link>
        ) : null}
      </EmptyState>
    </WorkspacePanel>
  );
}

export function JobExecutionWorkPlanView({
  jobId,
  stages,
  jobIssues,
  liveSignals,
  totalTasks,
  firstAddableStageId,
  jobContextLabel,
  jobsiteAddressLine,
  customerId,
  leadEditHref,
  getPaymentHold,
}: {
  jobId: string;
  stages: StageRow[];
  jobIssues: StageIssue[];
  liveSignals: string[];
  totalTasks: number;
  firstAddableStageId: string | null;
  jobContextLabel: string;
  jobsiteAddressLine: string | null;
  customerId: string | null;
  leadEditHref: string | null;
  getPaymentHold: (stageId: string) => TaskPaymentHold;
}) {
  return (
    <div className="space-y-8">
      {totalTasks === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-border bg-surface/60 px-4 py-3 text-xs leading-relaxed text-foreground-muted">
          No tasks yet on this job. Add the first step to the internal work plan below. This
          does not change the quote or customer-approved scope.
        </div>
      ) : null}
      {stages.map((stage) => (
        <section key={stage.id}>
          <div className="mb-3 flex items-center justify-between gap-4 border-b border-border pb-2">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {stage.title}
            </h3>
            {stage.title === CORRECTIONS_STAGE_NAME ? (
              <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                Recovery tasks only
              </p>
            ) : (
              <JobTaskAddButton
                jobId={jobId}
                jobStageId={stage.id}
                stageTitle={stage.title}
                variant={
                  totalTasks === 0 && stage.id === firstAddableStageId ? "empty" : "stage"
                }
              />
            )}
          </div>
          {stage.tasks.length === 0 ? (
            <p className="text-xs text-foreground-muted">
              {stage.title === CORRECTIONS_STAGE_NAME
                ? "Correction tasks appear here when a recovery path is active."
                : "No tasks on this stage yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {stage.tasks.map((task, taskIndex) => {
                const paymentHold = getPaymentHold(stage.id);
                const issueForRecovery = task.recoveryFlow?.jobIssueId
                  ? jobIssues.find((issue) => issue.id === task.recoveryFlow?.jobIssueId)
                  : null;
                const showRecoveryFallbackLabels =
                  stage.title === CORRECTIONS_STAGE_NAME && !!issueForRecovery;
                const totalRecoveryTasks = issueForRecovery?.recoveryFlow?.tasks.length ?? 0;
                const stepNumber = showRecoveryFallbackLabels
                  ? (issueForRecovery!.recoveryFlow!.tasks.findIndex((t) => t.id === task.id) +
                      1)
                  : 0;
                return (
                  <li key={task.id} id={`task-${task.id}`}>
                    {showRecoveryFallbackLabels && (
                      <div className="mb-2 rounded-lg border border-border bg-surface/60 px-3 py-2 text-[10px] text-foreground-muted">
                        <p>
                          <span className="font-bold uppercase tracking-wider text-foreground-subtle">
                            Recovery for:
                          </span>{" "}
                          <span className="font-medium text-foreground">
                            {issueForRecovery?.jobTask?.title ??
                              issueForRecovery?.jobStage?.title ??
                              "Blocked task"}
                          </span>
                        </p>
                        <p className="mt-0.5">
                          <span className="font-bold uppercase tracking-wider text-foreground-subtle">
                            Issue:
                          </span>{" "}
                          <span className="font-medium text-foreground">
                            {issueForRecovery?.title}
                          </span>
                        </p>
                        <p className="mt-0.5">
                          <span className="font-bold uppercase tracking-wider text-foreground-subtle">
                            Step:
                          </span>{" "}
                          <span className="font-medium text-foreground">
                            {`Step ${stepNumber > 0 ? stepNumber : taskIndex + 1} of ${totalRecoveryTasks > 0 ? totalRecoveryTasks : stage.tasks.length}`}
                          </span>
                        </p>
                      </div>
                    )}
                    <JobTaskCard
                      jobId={jobId}
                      jobStageId={stage.id}
                      stageTitle={stage.title}
                      jobContextLabel={jobContextLabel}
                      jobsiteAddressLine={jobsiteAddressLine}
                      customerId={customerId}
                      leadEditHref={leadEditHref}
                      task={task}
                      liveSignals={liveSignals}
                      stageIssues={stage.issues}
                      paymentHold={paymentHold}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
