"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";
import { jobDetailPath } from "@/lib/job-path";
import type { QuoteJobActivationReadiness } from "@/lib/quote-job-activation-readiness";
import { groupQuotePlanTasksByStage } from "@/lib/quote-execution-plan-surface";
import { QuoteActivateJobForm } from "@/components/quotes/quote-activate-job-form";
import { QuoteBlockedActivationPanel } from "@/components/quotes/quote-blocked-activation-panel";
import { QuoteExecutionDependencyGapsPanel } from "@/components/quotes/quote-execution-dependency-gaps-panel";
import { QuoteExecutionReadinessChecklist } from "@/components/quotes/quote-execution-readiness-checklist";
import { QuotePlanControlPanel } from "@/components/quotes/quote-plan-control-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { useState, useTransition } from "react";
import {
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Hammer,
  Info,
  ListChecks,
  Lock,
  Package,
  Unlock,
  Zap,
} from "lucide-react";
import { toggleQuoteExecutionTaskProtectionAction } from "@/app/(workspace)/quotes/quote-plan-actions";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type QuoteActivationStatus =
  | { state: "activated"; jobId: string }
  | { state: "ready_to_activate"; readiness: QuoteJobActivationReadiness }
  | { state: "blocked"; readiness: QuoteJobActivationReadiness; quoteIsApproved: boolean };

type PlanTaskRow = {
  id: string;
  title: string;
  stageName: string;
  sortOrder: number;
  protectedAt: Date | null;
  humanEditedAt: Date | null;
  providesSignals: string[];
  requiresSignals: string[];
  scopeLineIds: string[];
};

type GapTaskChoice = {
  id: string;
  title: string;
  stageId: string | null;
  category: string;
};

export function QuoteExecutionReviewPreviewView({
  quoteId,
  executionPlanningEditable,
  model,
  activation,
  hasPlanTasks,
  planTasksForGaps,
  executionPlanTasks,
  lineLabelById,
  executionPlanState,
  isStale,
  stages,
  scopeLines,
  draftTaskCount,
}: {
  quoteId: string;
  executionPlanningEditable: boolean;
  model: QuoteExecutionReviewPreviewModel;
  activation: QuoteActivationStatus;
  hasPlanTasks: boolean;
  planTasksForGaps: readonly GapTaskChoice[];
  executionPlanTasks: PlanTaskRow[];
  lineLabelById: Record<string, string>;
  executionPlanState: {
    status: "DRAFT" | "READY_FOR_REVIEW" | "ACCEPTED";
    planVersion: number;
    taskCount: number;
  } | null;
  isStale: boolean;
  stages: readonly { id: string; name: string }[];
  scopeLines: readonly { id: string; description: string; executionRelevant: boolean }[];
  draftTaskCount: number;
}) {
  const { summary, handshakes, orphans, lineReadiness, equipmentRollup } = model;
  const planAccepted = executionPlanState?.status === "ACCEPTED" && !isStale;
  const planInputsCurrent = !isStale;

  const planTasksByStage = groupQuotePlanTasksByStage(
    executionPlanTasks.map((task) => ({
      id: task.id,
      title: task.title,
      stageId: null,
      stageName: task.stageName,
      category: "GENERAL" as never,
      sortOrder: task.sortOrder,
      providesSignals: task.providesSignals,
      requiresSignals: task.requiresSignals,
      hardSignal: false,
      scopeLineIds: task.scopeLineIds,
    })),
  );

  const showPreActivationPanels = activation.state !== "activated";
  const blockedReadiness = activation.state !== "activated" ? activation.readiness : null;
  const quoteIsApproved =
    activation.state === "blocked" ? activation.quoteIsApproved : activation.state === "ready_to_activate";
  const hasApprovalCheckpoint = blockedReadiness
    ? !blockedReadiness.blockReasons.some((reason) => reason.code === "APPROVAL_CHECKPOINT_MISSING")
    : false;

  return (
    <div className="space-y-6">
      {showPreActivationPanels ? (
        <>
          <QuotePlanControlPanel
            quoteId={quoteId}
            executionPlan={executionPlanState}
            isStale={isStale}
            canEdit={executionPlanningEditable}
            stages={stages}
            scopeLines={scopeLines}
            draftTaskCount={draftTaskCount}
            lineLabelById={lineLabelById}
          />

          <ActivationPanel activation={activation} quoteId={quoteId} hardOrphanCount={summary.hardOrphanCount} />

          {blockedReadiness ? (
            <QuoteExecutionReadinessChecklist
              quoteIsApproved={quoteIsApproved}
              hasApprovalCheckpoint={hasApprovalCheckpoint}
              hasPlanTasks={hasPlanTasks}
              planAccepted={Boolean(planAccepted)}
              planInputsCurrent={planInputsCurrent}
              readiness={blockedReadiness}
            />
          ) : null}
        </>
      ) : (
        <ActivationPanel activation={activation} quoteId={quoteId} hardOrphanCount={0} />
      )}

      {summary.totalLines === 0 ? (
        <WorkspacePanel>
          <EmptyState
            icon={ClipboardList}
            title="Add line items before building the execution plan"
            description="This quote does not have any scope rows yet. Return to the quote, add line items, then build the execution plan."
          >
            <Link href={`/quotes/${quoteId}`} className={listLinkClass}>
              ← Back to quote
            </Link>
          </EmptyState>
        </WorkspacePanel>
      ) : !hasPlanTasks ? (
        <WorkspacePanel>
          <EmptyState
            icon={ClipboardList}
            title="No execution plan yet"
            description={`Use “Add task manually”, import per-line drafts, or generate an AI proposal above. Per-line draft tasks on the quote are seed material — activation copies the accepted quote-wide plan into the job.`}
          />
        </WorkspacePanel>
      ) : (
        <>
          {orphans.length > 0 && (
            <WorkspacePanel className="border-l-[3px] border-l-warning bg-warning/5">
              <QuoteExecutionDependencyGapsPanel
                quoteId={quoteId}
                orphans={orphans}
                executionPlanningEditable={executionPlanningEditable}
                lineLabelById={lineLabelById}
                planTasks={planTasksForGaps}
                taskLineIdsByTaskId={Object.fromEntries(
                  executionPlanTasks.map((task) => [task.id, task.scopeLineIds]),
                )}
              />
            </WorkspacePanel>
          )}

          <WorkspacePanel>
            <div id="plan-preview" className="scroll-mt-20">
            <SectionHeading
              title="Plan preview"
              description="This is the work plan that will be copied into the job at activation."
            />
            <div className="mt-4 space-y-4">
              {planTasksByStage.map((group) => (
                <div key={group.stageName}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                    {group.stageName}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {group.tasks.map((task) => {
                      const fullTask = executionPlanTasks.find((row) => row.id === task.id);
                      if (!fullTask) return null;
                      return (
                        <li
                          key={task.id}
                          id={`plan-task-${task.id}`}
                          className="scroll-mt-20 rounded-lg border border-border bg-surface p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground">{fullTask.title}</p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {fullTask.scopeLineIds.map((lineId) => (
                                  <span
                                    key={`${task.id}-${lineId}`}
                                    className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground-muted"
                                  >
                                    {lineLabelById[lineId] ?? "Unknown scope"}
                                  </span>
                                ))}
                              </div>
                              {(fullTask.requiresSignals.length > 0 || fullTask.providesSignals.length > 0) && (
                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-foreground-muted">
                                  {fullTask.requiresSignals.length > 0 ? (
                                    <span>Needs: {fullTask.requiresSignals.join(", ")}</span>
                                  ) : null}
                                  {fullTask.providesSignals.length > 0 ? (
                                    <span>Provides: {fullTask.providesSignals.join(", ")}</span>
                                  ) : null}
                                </div>
                              )}
                              <div className="mt-2 flex flex-wrap gap-1">
                                {fullTask.protectedAt ? (
                                  <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">
                                    Protected
                                  </span>
                                ) : null}
                                {fullTask.humanEditedAt ? (
                                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                                    Human edited
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {executionPlanningEditable ? (
                              <TaskProtectionButton
                                quoteId={quoteId}
                                taskId={fullTask.id}
                                protectedMode={!fullTask.protectedAt}
                              />
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            </div>
          </WorkspacePanel>

          <WorkspacePanel>
            <SectionHeading
              title="Scope coverage"
              description="Each line item and how many planned tasks cover it."
            />
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {lineReadiness.map((row) => (
                <li key={row.lineId} id={`execution-line-${row.lineId}`} className="scroll-mt-20 px-4 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{row.description}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-foreground-muted">
                      <span>
                        {row.taskCount} {row.taskCount === 1 ? "planned task" : "planned tasks"}
                      </span>
                      {row.checklistCount > 0 && (
                        <span className="flex items-center gap-1">
                          <ListChecks className="size-3 text-foreground-subtle" />
                          {row.checklistCount} checklist {row.checklistCount === 1 ? "step" : "steps"}
                        </span>
                      )}
                      {row.equipmentCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Hammer className="size-3 text-foreground-subtle" />
                          {row.equipmentCount} material/equipment {row.equipmentCount === 1 ? "item" : "items"}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </WorkspacePanel>

          {(handshakes.length > 0 || equipmentRollup.length > 0) && (
            <WorkspacePanel>
              <SectionHeading
                title="Advanced review"
                description="Dependency wiring details and aggregated materials — optional deep review."
              />
              {handshakes.length > 0 ? (
                <details className="mt-3 rounded-lg border border-border bg-surface p-3">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">
                    Show dependency graph ({handshakes.length})
                  </summary>
                  <ul className="mt-4 space-y-4">
                    {handshakes.map((h, i) => (
                      <li key={i} className="relative flex items-center gap-4 rounded-xl border border-border bg-background p-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">Upstream</p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">{h.providerTaskTitle}</p>
                          <p className="truncate text-[10px] text-foreground-muted">{h.providerLineDescription}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <div className="h-px w-8 bg-border" />
                          <div className="rounded-full bg-accent/10 p-1.5">
                            <Zap className="size-3.5 text-accent" />
                          </div>
                          <span className="font-mono text-[10px] font-bold text-accent">{h.signal}</span>
                          <div className="h-px w-8 bg-border" />
                        </div>
                        <div className="min-w-0 flex-1 text-right">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">Downstream</p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">{h.consumerTaskTitle}</p>
                          <p className="truncate text-[10px] text-foreground-muted">{h.consumerLineDescription}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {equipmentRollup.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-foreground/[0.02] text-xs font-bold uppercase tracking-wider text-foreground-subtle">
                      <tr>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Item</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3">Tasks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {equipmentRollup.map((item, i) => (
                        <tr key={i} className="hover:bg-foreground/[0.01]">
                          <td className="whitespace-nowrap px-4 py-3">
                            {item.isEquipment ? (
                              <div className="flex items-center gap-1.5 text-accent">
                                <Hammer className="size-3" />
                                <span>Equipment</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-success">
                                <Package className="size-3" />
                                <span>Part/Material</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {item.quantity} {item.unit}
                          </td>
                          <td className="px-4 py-3 text-foreground-muted">
                            <div className="flex flex-wrap gap-1">
                              {item.taskTitles.map((title, j) => (
                                <span key={j} className="rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[10px]">
                                  {title}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </WorkspacePanel>
          )}
        </>
      )}

      <WorkspacePanel padding="compact" className="border-dashed border-border bg-surface/80">
        <div className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground-muted">
            Review and accept the quote-wide execution plan before creating the job. After activation, runtime work lives
            on the job — change orders and scope revisions update job records, not this pre-activation plan.
          </p>
        </div>
      </WorkspacePanel>
    </div>
  );
}

function TaskProtectionButton({
  quoteId,
  taskId,
  protectedMode,
}: {
  quoteId: string;
  taskId: string;
  protectedMode: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] text-foreground-muted hover:border-border-strong hover:text-foreground disabled:opacity-60"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await toggleQuoteExecutionTaskProtectionAction(quoteId, taskId, protectedMode);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {protectedMode ? <Lock className="size-3" /> : <Unlock className="size-3" />}
        {isPending ? "Saving..." : protectedMode ? "Protect" : "Unprotect"}
      </button>
      {error ? <span className="text-[10px] text-danger">{error}</span> : null}
    </div>
  );
}

function ActivationPanel({
  activation,
  quoteId,
  hardOrphanCount,
}: {
  activation: QuoteActivationStatus;
  quoteId: string;
  hardOrphanCount: number;
}) {
  if (activation.state === "activated") {
    return (
      <WorkspacePanel className="border-l-[3px] border-l-success/60 bg-success/[0.04]">
        <SectionHeading
          title="Job created from approved quote"
          description="An active job already exists for this quote. Changes here do not update the existing job."
        />
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
          <Link
            href={jobDetailPath(activation.jobId)}
            className="inline-flex items-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90"
          >
            Open job
          </Link>
          <span className="text-xs text-foreground-muted">One job per quote.</span>
        </div>
      </WorkspacePanel>
    );
  }

  if (activation.state === "ready_to_activate") {
    const r = activation.readiness;
    return (
      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Ready to create job"
          description={`${r.totalTasksToActivate} planned tasks will copy into the job with stages, dependencies, and payment requirements.`}
        />
        <div className="flex items-start gap-3">
          <Briefcase className="mt-1 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <div className="flex-1">
            <QuoteActivateJobForm quoteId={quoteId} />
          </div>
        </div>
      </WorkspacePanel>
    );
  }

  return (
    <QuoteBlockedActivationPanel
      quoteId={quoteId}
      readiness={activation.readiness}
      quoteIsApproved={activation.quoteIsApproved}
      hardOrphanCount={hardOrphanCount}
    />
  );
}
