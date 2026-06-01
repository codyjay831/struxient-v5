import Link from "next/link";
import type { QuoteExecutionReviewPreviewModel } from "@/lib/quote-execution-review-preview-model";
import { jobDetailPath } from "@/lib/job-path";
import type {
  QuoteJobActivationReadiness,
} from "@/lib/quote-job-activation-readiness";
import { QuoteActivateJobForm } from "@/components/quotes/quote-activate-job-form";
import { QuoteLineDraftExecutionInlineToggle } from "@/components/quotes/quote-line-draft-execution-inline-toggle";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { SignalCard } from "@/components/ui/signal-card";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import { Briefcase, CheckCircle2, ClipboardList, Info, ShieldAlert, Zap, Package, Hammer, ListChecks } from "lucide-react";

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
  reusableTaskOptions,
  stages,
}: {
  quoteId: string;
  quoteTitle: string;
  executionPlanningEditable: boolean;
  model: QuoteExecutionReviewPreviewModel;
  activation: QuoteActivationStatus;
  /** Full draft execution task rows by quote line item id — used by the inline editor. */
  draftTasksByLineId: Record<string, readonly QuoteLineDraftExecutionTaskRow[]>;
  /** Org-scoped reusable task picker options. Empty when execution edits are not allowed. */
  reusableTaskOptions: ReusableTaskPickerOption[];
  stages: { id: string; name: string }[];
}) {
  const { summary, handshakes, orphans, lineReadiness, equipmentRollup } = model;

  return (
    <div className="space-y-6">
      <ActivationPanel activation={activation} quoteId={quoteId} />

      {summary.totalLines === 0 ? (
        <WorkspacePanel>
          <EmptyState
            icon={ClipboardList}
            title="Add line items before reviewing the job plan"
            description="This quote does not have any scope rows yet. Return to the quote, add line items, then review the job plan again."
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
          </WorkspacePanel>

          {orphans.length > 0 && (
            <WorkspacePanel className="border-l-[3px] border-l-warning bg-warning/5">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Dependency gaps</h3>
                  <p className="mt-1 text-xs text-foreground-muted leading-relaxed">
                    These task dependencies are required but do not yet have an upstream task in this quote.
                    <strong> Auto-resolved gaps</strong> are handled during job creation.
                    <strong> Required gaps</strong> must be resolved before creating the job.
                  </p>
                  <ul className="mt-4 space-y-3">
                    {orphans.map((o, i) => (
                      <li key={i} className="rounded-lg border border-border bg-background/50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${o.isHard ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                            {o.isHard ? 'Required gap' : 'Auto-resolved gap'}
                          </span>
                          <span className="font-mono text-[10px] text-foreground-subtle">{o.signal}</span>
                        </div>
                        <p className="mt-2 text-xs font-medium text-foreground">{o.consumerTaskTitle}</p>
                        <p className="text-[10px] text-foreground-muted">Line: {o.consumerLineDescription}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </WorkspacePanel>
          )}

          {handshakes.length > 0 && (
            <WorkspacePanel>
              <SectionHeading
                title="Task dependencies"
                description="How work unlocks across line items. When the upstream task is complete, downstream work can become ready."
              />
              <ul className="mt-4 space-y-4">
                {handshakes.map((h, i) => (
                  <li key={i} className="relative flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
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
                return (
                  <li key={row.lineId} className="px-4 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
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
                        <div className="shrink-0">
                          <QuoteLineDraftExecutionInlineToggle
                            quoteId={quoteId}
                            lineItemId={row.lineId}
                            taskCount={row.taskCount}
                            draftTasks={[...draftTasks]}
                            reusableOptions={reusableTaskOptions}
                            stages={stages}
                            revalidateScope="execution-review"
                            openLabelOverride={row.taskCount === 0 ? "Add tasks" : "Refine with AI"}
                          />
                        </div>
                      ) : null}
                    </div>
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
            Review this work plan before creating the job from the approved quote.
            Planned tasks, dependencies, and payment requirements move into the active job at creation.
            Required dependency gaps must be resolved before job creation.
          </p>
        </div>
      </WorkspacePanel>
    </div>
  );
}

function ActivationPanel({
  activation,
  quoteId,
}: {
  activation: QuoteActivationStatus;
  quoteId: string;
}) {
  if (activation.state === "activated") {
    return (
      <WorkspacePanel className="border-l-[3px] border-l-success/60 bg-success/[0.04]">
        <SectionHeading
          title="Job created from approved quote"
          description="An active job already exists for this quote. Changes made here do not update the existing job plan."
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
    <WorkspacePanel className="border-l-[3px] border-l-accent/70 bg-accent/[0.04]">
      <SectionHeading
        title="Needs review before job creation"
        description={
          activation.quoteIsApproved
            ? "Resolve the items below before creating the job from this approved quote."
            : "Job creation is available after quote approval. Resolve any planning gaps now so it is ready once approval is recorded."
        }
      />
      <ul className="space-y-3">
        {r.blockReasons.map((reason) => (
          <li key={reason.code} className="rounded-md border border-border bg-background/40 px-3 py-2">
            <p className="text-sm font-medium text-foreground">{reason.message}</p>
            {reason.code === "TASK_MISSING_STAGE" ? (
              <Link
                href={`/quotes/${quoteId}`}
                className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
              >
                Assign stages on the quote
              </Link>
            ) : null}
            {reason.details && reason.details.length > 0 ? (
              <ul className="mt-1 space-y-1 text-xs text-foreground-muted">
                {reason.details.map((detail) => (
                  <li key={detail}>· {detail}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </WorkspacePanel>
  );
}
