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
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import { Briefcase, CheckCircle2, ClipboardList, Layers, ListTree, ShieldAlert } from "lucide-react";

const listLinkClass =
  "inline-flex items-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground";

function headlineTone(headline: QuoteExecutionReviewPreviewModel["summary"]["headline"]): StatusBadgeTone {
  switch (headline) {
    case "needs_decisions":
      return "draft";
    case "ready_for_activation_review":
      return "approved";
    case "commercial_only_execution":
    case "no_draft_tasks_yet":
    case "no_line_items":
      return "neutral";
    default:
      return "neutral";
  }
}

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
}) {
  const { summary, lineReadiness, sharedStages, separateBlocks, needsAttentionLines, commercialOnlyLines } = model;
  const hasAnomaly = commercialOnlyLines.some((l) => l.anomaly);

  return (
    <div className="space-y-6">
      <ActivationPanel activation={activation} quoteId={quoteId} />

      {summary.headline === "no_line_items" ? (
        <WorkspacePanel>
          <EmptyState
            icon={ClipboardList}
            title="Add line items before reviewing execution"
            description="This quote does not have any scope rows yet. Return to the quote and add lines, then open this preview again."
          >
            <Link href={`/quotes/${quoteId}`} className={listLinkClass}>
              ← Back to quote
            </Link>
          </EmptyState>
        </WorkspacePanel>
      ) : null}

      {summary.headline !== "no_line_items" ? (
        <WorkspacePanel>
          <SectionHeading
            title="Readiness at a glance"
            description={`Quote “${quoteTitle}”. Counts reflect how lines are marked and how draft tasks would roll into a future job plan—nothing here activates work.`}
          />
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <StatusBadge label={summary.headlineLabel} tone={headlineTone(summary.headline)} />
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground-muted">
                {summary.headlineDescription}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SignalCard label="Line items" value={String(summary.totalLines)} hint="Commercial scope rows." />
            <SignalCard
              label="Lines with draft tasks"
              value={String(summary.linesWithTasks)}
              hint="At least one internal task on the line."
            />
            <SignalCard
              label="Needs execution review"
              value={String(summary.needsReviewLines)}
              hint="Not commercial-only and no tasks yet."
            />
            <SignalCard
              label="No execution needed"
              value={String(summary.noExecutionNeededLines)}
              hint="Marked commercial-only for execution."
            />
            <SignalCard
              label="Shared job stages (lines)"
              value={String(summary.mergeIntoSharedStageLines)}
              hint="Lines not marked commercial-only using merge mode."
            />
            <SignalCard
              label="Separate blocks (lines)"
              value={String(summary.keepSeparateBlockLines)}
              hint="Lines not marked commercial-only using separate mode."
            />
          </div>
        </WorkspacePanel>
      ) : null}

      {summary.headline !== "no_line_items" ? (
        <WorkspacePanel>
          <SectionHeading
            title="Line readiness"
            description="Review each line’s execution tasks before activation. You can make final task adjustments here."
          />
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {lineReadiness.map((row) => {
              const draftTasks = draftTasksByLineId[row.lineId] ?? [];
              return (
                <li key={row.lineId} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">
                        Work order {row.workOrderPosition} of {row.workOrderTotal}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{row.description}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {row.readinessLabel} · {row.mergeLabel}
                        {row.taskCount > 0 ? (
                          <>
                            {" "}
                            · {row.taskCount} {row.taskCount === 1 ? "task" : "tasks"}
                            {row.stageSummaryLine ? ` · ${row.stageSummaryLine}` : ""}
                          </>
                        ) : null}
                      </p>
                      {row.anomalyCommercialOnlyWithTasks ? (
                        <p className="mt-2 text-xs text-danger" role="alert">
                          This line is marked commercial-only but still has draft tasks—update planning or tasks on the
                          line.
                        </p>
                      ) : null}
                    </div>
                    {executionPlanningEditable ? (
                      <div className="shrink-0">
                        <QuoteLineDraftExecutionInlineToggle
                          quoteId={quoteId}
                          lineItemId={row.lineId}
                          taskCount={row.taskCount}
                          draftTasks={draftTasks}
                          reusableOptions={reusableTaskOptions}
                          revalidateScope="execution-review"
                          openLabelOverride={row.taskCount === 0 ? "Add tasks" : "Edit execution"}
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </WorkspacePanel>
      ) : null}

      {hasAnomaly ? (
        <WorkspacePanel
          padding="compact"
          className="border border-border border-l-[3px] border-l-danger/60 bg-danger/[0.03]"
        >
          <div className="flex gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="text-sm font-medium text-foreground">Planning mismatch</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                At least one line is marked no execution needed but still has draft tasks. This should not happen
                under normal saves—clean it up before trusting this preview.
              </p>
            </div>
          </div>
        </WorkspacePanel>
      ) : null}

      {needsAttentionLines.length > 0 ? (
        <WorkspacePanel
          padding="compact"
          className="border border-border border-l-[3px] border-l-accent/70 bg-accent/[0.04]"
        >
          <SectionHeading
            title="Needs execution review"
            description="These lines are not marked commercial-only and have no draft tasks yet. Open Edit execution on each line above to add tasks or mark the line commercial-only."
          />
          <ul className="mt-3 space-y-2">
            {needsAttentionLines.map((l) => (
              <li
                key={l.lineId}
                className="flex flex-col gap-1 rounded-md border border-border bg-background/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-foreground">{l.description}</span>
                {!executionPlanningEditable ? (
                  <span className="text-xs text-foreground-muted">This quote is archived; restore to edit.</span>
                ) : null}
              </li>
            ))}
          </ul>
        </WorkspacePanel>
      ) : null}

      {summary.headline === "no_draft_tasks_yet" && summary.totalLines > 0 ? (
        <WorkspacePanel padding="compact" className="border-dashed border-border bg-foreground/[0.02]">
          <p className="text-sm text-foreground-muted">
            No draft execution has been added yet on this quote. Add tasks on lines that need work, or mark lines
            commercial-only where that matches how you sell the job.
          </p>
        </WorkspacePanel>
      ) : null}

      {summary.headline === "commercial_only_execution" && summary.totalLines > 0 ? (
        <WorkspacePanel padding="compact" className="border-dashed border-border bg-foreground/[0.02]">
          <p className="text-sm text-foreground-muted">
            Every line is marked no execution needed. A future activation could still create a job from the quote, but
            this preview shows no internal execution tasks sourced from these lines until you add them.
          </p>
        </WorkspacePanel>
      ) : null}

      {sharedStages.length > 0 ? (
        <WorkspacePanel>
          <SectionHeading
            title="Shared job stages (preview)"
            description="Tasks from lines set to use shared job stages, merged by canonical phase. Within each phase, work follows line work order, then task order."
          />
          <div className="space-y-6">
            {sharedStages.map((stage) => (
              <section key={stage.stageKey}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">
                  {stage.stageLabel}
                </h3>
                <ul className="space-y-2">
                  {stage.tasks.map((t) => (
                    <li
                      key={t.taskId}
                      className="rounded-md border border-border/80 bg-background/30 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-foreground">{t.title}</p>
                      <p className="mt-0.5 text-xs text-foreground-muted">From line: {t.sourceLineDescription}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}

      {separateBlocks.length > 0 ? (
        <WorkspacePanel>
          <SectionHeading
            title="Separate execution blocks (preview)"
            description="Each block is one quoted scope kept apart from shared stages—still ordered by work order on the quote."
          />
          <div className="space-y-6">
            {separateBlocks.map((block) => (
              <section
                key={block.lineId}
                className="rounded-lg border border-border-strong bg-surface/80 px-4 py-4 ring-1 ring-ring/20"
              >
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-foreground-subtle" aria-hidden />
                    <h3 className="text-sm font-semibold text-foreground">{block.lineDescription}</h3>
                  </div>
                  <p className="text-xs text-foreground-muted">Work order {block.workOrderPosition}</p>
                </div>
                <div className="space-y-4 border-t border-border pt-3">
                  {block.stages.map((st) => (
                    <div key={st.stageKey}>
                      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                        {st.stageLabel}
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {st.tasks.map((t) => (
                          <li
                            key={t.taskId}
                            className="rounded border border-border/60 bg-background/40 px-2.5 py-1.5 text-sm text-foreground"
                          >
                            {t.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </WorkspacePanel>
      ) : null}

      {commercialOnlyLines.length > 0 ? (
        <WorkspacePanel>
          <SectionHeading
            title="Commercial-only lines"
            description="Lines marked no execution needed—they stay out of the merged and separate task previews above."
          />
          <ul className="space-y-2">
            {commercialOnlyLines.map((l) => (
              <li
                key={l.lineId}
                className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-foreground-muted"
              >
                {l.description}
                {l.anomaly ? (
                  <span className="ml-2 text-xs font-medium text-danger"> (has tasks—see warning above)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </WorkspacePanel>
      ) : null}

      {sharedStages.length === 0 &&
      separateBlocks.length === 0 &&
      summary.headline !== "no_line_items" &&
      summary.totalTasks > 0 ? (
        <WorkspacePanel padding="compact">
          <p className="text-sm text-foreground-muted">
            Draft tasks exist, but none appear in the structured preview—check line merge settings and commercial-only
            flags.
          </p>
        </WorkspacePanel>
      ) : null}

      <WorkspacePanel padding="compact" className="border-dashed border-border bg-surface/80">
        <div className="flex gap-2">
          <ListTree className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden />
          <p className="text-xs leading-relaxed text-foreground-muted">
            Internal planning view. Activation copies these stages and tasks into a runtime job—later quote edits do
            not change tasks already on the job. Customer proposal preview and commercial checkpoints stay
            commercial-only.
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
          description="Runtime job already exists for this quote. Editing draft execution here does not change tasks already on the job."
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
          title="Activate this approved quote"
          description="Creates one job from this quote with shared stages and any separate work blocks copied from the draft execution below. Lineage to the source quote line and task is preserved on every job task."
        />
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <SignalCard
            label="Total tasks to activate"
            value={String(r.totalTasksToActivate)}
            hint="Tasks copied into the job at activation."
          />
          <SignalCard
            label="Shared stage tasks"
            value={String(r.sharedTaskCount)}
            hint="Tasks merged across lines using canonical phases."
          />
          <SignalCard
            label="Separate work blocks"
            value={String(r.separateBlockCount)}
            hint="Lines kept as their own block."
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
        title="Activation not ready"
        description={
          activation.quoteIsApproved
            ? "Resolve the items below to activate this approved quote into a job."
            : "Activate is available after the quote is approved. Resolve any planning gaps below now so it is ready when acceptance is recorded."
        }
      />
      <ul className="space-y-3">
        {r.blockReasons.map((reason) => (
          <li key={reason.code} className="rounded-md border border-border bg-background/40 px-3 py-2">
            <p className="text-sm font-medium text-foreground">{reason.message}</p>
            {reason.lines.length > 0 ? (
              <ul className="mt-1 space-y-1 text-xs text-foreground-muted">
                {reason.lines.map((l) => (
                  <li key={l.id}>· {l.description}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </WorkspacePanel>
  );
}
