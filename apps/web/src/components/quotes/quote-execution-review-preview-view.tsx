"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";
import { jobDetailPath } from "@/lib/job-path";
import type {
  QuoteJobActivationReadiness,
} from "@/lib/quote-job-activation-readiness";
import { QuoteActivateJobForm } from "@/components/quotes/quote-activate-job-form";
import { QuoteBlockedActivationPanel } from "@/components/quotes/quote-blocked-activation-panel";
import {
  QuoteCrossLineWiringReviewPanel,
  QuoteCrossLineWiringReviewScope,
  QuoteCrossLineWiringReviewTrigger,
} from "@/components/quotes/quote-cross-line-wiring-review";
import { QuoteExecutionDependencyGapsPanel } from "@/components/quotes/quote-execution-dependency-gaps-panel";
import { QuoteExecutionReviewFocusProvider } from "@/components/quotes/quote-execution-review-focus";
import { QuoteLineDraftExecutionInlineToggle } from "@/components/quotes/quote-line-draft-execution-inline-toggle";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import { useState, useTransition, type ReactNode } from "react";
import { Briefcase, CheckCircle2, ClipboardList, Info, Zap, Package, Hammer, ListChecks, Lock, Unlock } from "lucide-react";
import { toggleQuoteExecutionTaskProtectionAction } from "@/app/(workspace)/quotes/quote-plan-actions";
import { QuotePlanControlPanel } from "@/components/quotes/quote-plan-control-panel";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

export type QuoteActivationStatus =
  | { state: "activated"; jobId: string }
  | { state: "ready_to_activate"; readiness: QuoteJobActivationReadiness }
  | { state: "blocked"; readiness: QuoteJobActivationReadiness; quoteIsApproved: boolean };

export function QuoteExecutionReviewPreviewView({
  quoteId,
  quoteTitle,
  executionPlanningEditable,
  model,
  activation,
  draftTasksByLineId,
  planningContextByLineId,
  reusableTaskOptions,
  stages,
  executionPlanTasks,
  lineLabelById,
  executionPlanState,
  isStale,
}: {
  quoteId: string;
  quoteTitle: string;
  executionPlanningEditable: boolean;
  model: QuoteExecutionReviewPreviewModel;
  activation: QuoteActivationStatus;
  /** Full draft execution task rows by quote line item id — used by the inline editor. */
  draftTasksByLineId: Record<string, readonly QuoteLineDraftExecutionTaskRow[]>;
  /** AI planning context seed by line item id. */
  planningContextByLineId: Record<string, string>;
  /** Org-scoped reusable task picker options. Empty when execution edits are not allowed. */
  reusableTaskOptions: ReusableTaskPickerOption[];
  stages: { id: string; name: string }[];
  executionPlanTasks: Array<{
    id: string;
    title: string;
    stageName: string;
    protectedAt: Date | null;
    humanEditedAt: Date | null;
    providesSignals: string[];
    requiresSignals: string[];
    scopeLineIds: string[];
  }>;
  lineLabelById: Record<string, string>;
  executionPlanState: {
    status: "DRAFT" | "READY_FOR_REVIEW" | "ACCEPTED";
    planVersion: number;
    taskCount: number;
  } | null;
  isStale: boolean;
}) {
  const { summary, handshakes, orphans, lineReadiness, equipmentRollup } = model;
  const showCrossLineReview =
    executionPlanningEditable && summary.totalLines > 0 && summary.totalTasks > 0;

  const reviewContent = (
    <>
      {activation.state !== "activated" && (
        <QuotePlanControlPanel
          quoteId={quoteId}
          executionPlan={executionPlanState}
          isStale={isStale}
          canEdit={executionPlanningEditable}
        />
      )}

      <ActivationPanel
        activation={activation}
        quoteId={quoteId}
        showCrossLineReview={showCrossLineReview}
        hardOrphanCount={summary.hardOrphanCount}
      />

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
      ) : (
        <>
          <WorkspacePanel>
            <SectionHeading
              title="Readiness checks"
              description={`Quote “${quoteTitle}”. Review task dependencies across line items so the team has a clear path to start and continue work.`}
              actions={
                showCrossLineReview ? (
                  <QuoteCrossLineWiringReviewTrigger label="Review whole execution flow" />
                ) : null
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <SignalCard label="Line items" value={String(summary.totalLines)} hint="Commercial scope rows." />
              <SignalCard label="Total tasks" value={String(summary.totalTasks)} hint="Total execution steps." />
              <SignalCard label="Dependencies" value={String(handshakes.length)} hint="Connected task dependencies." />
              <SignalCard 
                label="Dependency gaps" 
                value={String(summary.orphanCount)} 
                tone={summary.hardOrphanCount > 0 ? "danger" : summary.orphanCount > 0 ? "warning" : "neutral"}
                hint="Dependencies without an upstream task." 
              />
              <SignalCard label="Outputs" value={String(summary.providedSignalCount)} hint="Unique completion outputs." />
              <SignalCard label="Dependencies needed" value={String(summary.requiredSignalCount)} hint="Unique prerequisites across tasks." />
            </div>
            {showCrossLineReview && orphans.length === 0 ? (
              <div className="mt-4">
                <QuoteCrossLineWiringReviewPanel />
              </div>
            ) : null}
          </WorkspacePanel>

          {orphans.length > 0 && (
            <WorkspacePanel className="border-l-[3px] border-l-warning bg-warning/5">
              <QuoteExecutionDependencyGapsPanel
                quoteId={quoteId}
                orphans={orphans}
                executionPlanningEditable={executionPlanningEditable}
                showCrossLineReview={showCrossLineReview}
                lineLabelById={Object.fromEntries(
                  lineReadiness.map((line) => [line.lineId, line.description]),
                )}
                draftTasksByLineId={draftTasksByLineId}
              />
            </WorkspacePanel>
          )}

          {executionPlanTasks.length > 0 && (
            <WorkspacePanel>
              <SectionHeading
                title="Plan tasks"
                description="Task scope links and task locks for this whole-quote plan."
              />
              <ul className="mt-4 space-y-3">
                {executionPlanTasks.map((task) => (
                  <li key={task.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                        <p className="text-[11px] text-foreground-muted">{task.stageName}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.scopeLineIds.map((lineId) => (
                            <span key={`${task.id}-${lineId}`} className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground-muted">
                              {lineLabelById[lineId] ?? "Unknown scope"}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {task.protectedAt ? (
                            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning">Protected</span>
                          ) : null}
                          {task.humanEditedAt ? (
                            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">Human edited</span>
                          ) : null}
                        </div>
                      </div>
                      {executionPlanningEditable ? (
                        <TaskProtectionButton
                          quoteId={quoteId}
                          taskId={task.id}
                          protectedMode={!task.protectedAt}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </WorkspacePanel>
          )}

          {(handshakes.length > 0 || orphans.length > 0) && (
            <WorkspacePanel>
              <SectionHeading
                title="Advanced dependencies"
                description="Detailed signal handshakes and dependency wiring across quote tasks."
              />
              <details className="mt-3 rounded-lg border border-border bg-surface p-3">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  Show dependency graph details
                </summary>
                {handshakes.length > 0 ? (
                  <ul className="mt-4 space-y-4">
                    {handshakes.map((h, i) => (
                      <li key={i} className="relative flex items-center gap-4 rounded-xl border border-border bg-background p-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">Upstream</p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">{h.providerTaskTitle}</p>
                          <p className="truncate text-[10px] text-foreground-muted">{h.providerLineDescription}</p>
                        </div>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div className="h-px w-8 bg-border" />
                          <div className="rounded-full bg-accent/10 p-1.5">
                            <Zap className="size-3.5 text-accent" />
                          </div>
                          <span className="font-mono text-[10px] font-bold text-accent">{h.signal}</span>
                          <div className="h-px w-8 bg-border" />
                        </div>
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">Downstream</p>
                          <p className="mt-1 truncate text-sm font-medium text-foreground">{h.consumerTaskTitle}</p>
                          <p className="truncate text-[10px] text-foreground-muted">{h.consumerLineDescription}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </details>
            </WorkspacePanel>
          )}

          {equipmentRollup.length > 0 && (
            <WorkspacePanel>
              <SectionHeading
                title="Equipment & Tools Rollup"
                description="Aggregated list of all equipment and tools required across all tasks in this quote."
              />
              <div className="mt-4 overflow-hidden rounded-lg border border-border bg-surface">
                <table className="w-full text-left text-xs">
                  <thead className="bg-foreground/[0.02] text-foreground-subtle uppercase tracking-wider font-bold">
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
                        <td className="px-4 py-3 whitespace-nowrap">
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
            </WorkspacePanel>
          )}

          <WorkspacePanel>
            <SectionHeading
              title="Line breakdown"
              description="Review task outputs and dependencies for each line item."
            />
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
              {lineReadiness.map((row) => {
                const draftTasks = draftTasksByLineId[row.lineId] ?? [];
                const planningContext = planningContextByLineId[row.lineId] ?? "";
                return (
                  <li
                    key={row.lineId}
                    id={`execution-line-${row.lineId}`}
                    className="scroll-mt-20 px-4 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{row.description}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-foreground-muted">
                        <span>
                          {row.taskCount} {row.taskCount === 1 ? "task" : "tasks"}
                        </span>
                        {row.checklistCount > 0 && (
                          <span className="flex items-center gap-1">
                            <ListChecks className="size-3 text-foreground-subtle" />
                            0/{row.checklistCount} {row.checklistCount === 1 ? "step" : "steps"}
                          </span>
                        )}
                        {row.equipmentCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Hammer className="size-3 text-foreground-subtle" />
                            {row.equipmentCount} {row.equipmentCount === 1 ? "item" : "items"}
                          </span>
                        )}
                      </div>

                      {(row.providesSignals.length > 0 || row.requiresSignals.length > 0) && (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {row.providesSignals.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Outputs</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {row.providesSignals.map(s => (
                                  <span key={s} className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-mono text-success">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {row.requiresSignals.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Dependencies</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {row.requiresSignals.map(s => (
                                  <span key={s} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-mono text-accent">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {executionPlanningEditable ? (
                      <div className="mt-4 flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
                        <QuoteLineDraftExecutionInlineToggle
                          quoteId={quoteId}
                          lineItemId={row.lineId}
                          taskCount={row.taskCount}
                          draftTasks={[...draftTasks]}
                          reusableOptions={reusableTaskOptions}
                          stages={stages}
                          revalidateScope="execution-review"
                          panelLayout="fullWidth"
                          hideAiButton
                          openLabelOverride={row.taskCount === 0 ? "Add tasks" : "Edit tasks"}
                          initialPlanningContext={planningContext}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </WorkspacePanel>
        </>
      )}

      <WorkspacePanel padding="compact" className="border-dashed border-border bg-surface/80">
        <div className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground-muted">
            Review this execution plan before creating the job from the approved quote.
            Planned tasks, dependencies, and payment requirements move into the active job at creation.
            Required dependency gaps must be resolved before job creation.
          </p>
        </div>
      </WorkspacePanel>
    </>
  );

  return (
    <div className="space-y-6">
      {wrapExecutionReviewProviders({
        quoteId,
        showCrossLineReview,
        executionPlanningEditable,
        children: reviewContent,
      })}
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
            const result = await toggleQuoteExecutionTaskProtectionAction(
              quoteId,
              taskId,
              protectedMode,
            );
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

function wrapExecutionReviewProviders({
  quoteId,
  showCrossLineReview,
  executionPlanningEditable,
  children,
}: {
  quoteId: string;
  showCrossLineReview: boolean;
  executionPlanningEditable: boolean;
  children: ReactNode;
}) {
  let wrapped = children;
  if (executionPlanningEditable) {
    wrapped = <QuoteExecutionReviewFocusProvider>{wrapped}</QuoteExecutionReviewFocusProvider>;
  }
  if (showCrossLineReview) {
    wrapped = (
      <QuoteCrossLineWiringReviewScope quoteId={quoteId}>{wrapped}</QuoteCrossLineWiringReviewScope>
    );
  }
  return wrapped;
}

function ActivationPanel({
  activation,
  quoteId,
  showCrossLineReview,
  hardOrphanCount,
}: {
  activation: QuoteActivationStatus;
  quoteId: string;
  showCrossLineReview: boolean;
  hardOrphanCount: number;
}) {
  if (activation.state === "activated") {
    return (
      <WorkspacePanel className="border-l-[3px] border-l-success/60 bg-success/[0.04]">
        <SectionHeading
          title="Job created from approved quote"
          description="An active job already exists for this quote. Changes made here do not update the existing job."
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
          title="Create job from this approved quote"
          description="Create one active job from this quote using the reviewed work plan, payment requirements, and readiness checks."
        />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SignalCard
            label="Tasks to activate"
            value={String(r.totalTasksToActivate)}
            hint="Planned tasks copied into the job."
          />
          <SignalCard
            label="Readiness"
            value="Ready"
            tone="success"
            hint="No blocking dependency gaps."
          />
        </div>
        <div className="flex items-start gap-3">
          <Briefcase className="mt-1 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <div className="flex-1">
            <QuoteActivateJobForm quoteId={quoteId} />
          </div>
        </div>
      </WorkspacePanel>
    );
  }

  const r = activation.readiness;
  return (
    <QuoteBlockedActivationPanel
      quoteId={quoteId}
      readiness={r}
      quoteIsApproved={activation.quoteIsApproved}
      showCrossLineReview={showCrossLineReview}
      hardOrphanCount={hardOrphanCount}
    />
  );
}
