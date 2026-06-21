"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Eye,
  Plus,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  generateQuoteExecutionPlanProposalAction,
  applyQuoteExecutionPlanProposalAction,
  acceptQuoteExecutionPlanAction,
  previewUncoordinatedDraftProposalAction,
} from "@/app/(workspace)/quotes/quote-plan-actions";
import { QuoteExecutionPlanProposalReviewPanel } from "@/components/quotes/quote-execution-plan-proposal-review-panel";
import { QuotePlanManualTaskDialog } from "@/components/quotes/quote-plan-manual-task-dialog";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import type { QuotePlanProposal } from "@/lib/quote-plan/quote-plan-proposal-schema";

type PlanStatus = "DRAFT" | "READY_FOR_REVIEW" | "ACCEPTED";

type GeneratingPhase = "idle" | "generating" | "proposal_ready" | "applying" | "accepting" | "loading_drafts";

type ProposalSource = "ai" | "drafts";

export function QuotePlanControlPanel({
  quoteId,
  executionPlan,
  isStale,
  canEdit,
  stages,
  scopeLines,
  draftTaskCount,
  lineLabelById,
}: {
  quoteId: string;
  executionPlan: {
    status: PlanStatus;
    planVersion: number;
    taskCount: number;
  } | null;
  isStale: boolean;
  canEdit: boolean;
  stages: readonly { id: string; name: string }[];
  scopeLines: readonly { id: string; description: string; executionRelevant: boolean }[];
  draftTaskCount: number;
  lineLabelById: Record<string, string>;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<GeneratingPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [proposal, setProposal] = useState<QuotePlanProposal | null>(null);
  const [proposalSource, setProposalSource] = useState<ProposalSource>("ai");
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [manualTaskOpen, setManualTaskOpen] = useState(false);
  const [, startTransition] = useTransition();

  const stageNameById = Object.fromEntries(stages.map((stage) => [stage.id, stage.name]));

  const hasExistingPlan = executionPlan !== null;
  const planAccepted = executionPlan?.status === "ACCEPTED";
  const planReadyForReview = executionPlan?.status === "READY_FOR_REVIEW";
  const proposalTaskCount =
    proposal?.operations.filter((operation) => operation.type === "ADD_TASK").length ?? 0;

  function clearProposal() {
    setProposal(null);
    setFallbackWarning(null);
    setReviewPanelOpen(false);
    if (phase === "proposal_ready") {
      setPhase("idle");
    }
  }

  function handleGenerateProposal() {
    setError(null);
    setFallbackWarning(null);
    setProposal(null);
    setProposalSource("ai");
    setPhase("generating");
    startTransition(async () => {
      const genResult = await generateQuoteExecutionPlanProposalAction(quoteId);
      if (!genResult.ok) {
        setError(genResult.error);
        setPhase("idle");
        return;
      }
      if (genResult.usedFallback && genResult.fallbackReason) {
        setFallbackWarning(genResult.fallbackReason);
      }
      setProposal(genResult.proposal);
      setPhase("proposal_ready");
      setReviewPanelOpen(true);
    });
  }

  function handleBuildFromDrafts() {
    setError(null);
    setFallbackWarning(null);
    setProposal(null);
    setProposalSource("drafts");
    setPhase("loading_drafts");
    startTransition(async () => {
      const result = await previewUncoordinatedDraftProposalAction(quoteId);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setProposal(result.proposal);
      setPhase("proposal_ready");
      setReviewPanelOpen(true);
    });
  }

  async function handleApplyProposal(
    nextProposal: QuotePlanProposal,
    selectedOpIds: string[],
    _replaceConfirmed: boolean,
  ) {
    if (!nextProposal) {
      setError("Generate a proposal before applying.");
      return;
    }
    const selected = new Set(selectedOpIds);
    const filteredProposal: QuotePlanProposal = {
      ...nextProposal,
      operations: nextProposal.operations.filter((operation) => selected.has(operation.opId)),
    };
    if (filteredProposal.operations.length === 0) {
      setError("Select at least one operation to apply.");
      return;
    }
    setError(null);
    setPhase("applying");
    startTransition(async () => {
      const applyResult = await applyQuoteExecutionPlanProposalAction(quoteId, filteredProposal, {
        applyMode: "replace_unprotected",
      });
      if (!applyResult.ok) {
        setError(applyResult.error);
        setPhase("proposal_ready");
        return;
      }
      clearProposal();
      setPhase("idle");
      router.refresh();
    });
  }

  function handleAccept() {
    setError(null);
    setFallbackWarning(null);
    setPhase("accepting");
    startTransition(async () => {
      const result = await acceptQuoteExecutionPlanAction(quoteId);
      if (!result.ok) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setPhase("idle");
      router.refresh();
    });
  }

  const isPending =
    phase === "generating" ||
    phase === "applying" ||
    phase === "accepting" ||
    phase === "loading_drafts";

  const statusBadge = executionPlan ? (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        planAccepted && !isStale
          ? "border-success/40 bg-success/10 text-success"
          : isStale
            ? "border-warning/40 bg-warning/10 text-warning"
            : planReadyForReview
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border bg-foreground/[0.04] text-foreground-muted"
      }`}
    >
      {planAccepted && !isStale ? (
        <CheckCircle2 className="size-3" />
      ) : isStale ? (
        <AlertTriangle className="size-3" />
      ) : (
        <CircleDashed className="size-3" />
      )}
      {planAccepted && !isStale
        ? "Accepted"
        : isStale
          ? "Needs re-review"
          : planReadyForReview
            ? "Ready for review"
            : "Draft"}
    </span>
  ) : null;

  const description = !hasExistingPlan
    ? "No whole-quote plan yet. Build manually, import per-line drafts, or generate an AI proposal before activation."
    : planAccepted && !isStale
      ? `Plan v${executionPlan.planVersion} is accepted. ${executionPlan.taskCount} tasks cover execution-relevant scope.`
      : isStale
        ? "Quote scope or planning inputs changed. Re-review and accept the plan before creating the job."
        : planReadyForReview
          ? `Plan v${executionPlan.planVersion} is ready for review — accept it to unlock job activation.`
          : `Plan v${executionPlan.planVersion} is a draft with ${executionPlan.taskCount} tasks. Accept to enable activation.`;

  const secondaryButtonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

  const primaryButtonClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <>
      <WorkspacePanel
        className={
          planAccepted && !isStale
            ? "border-l-[3px] border-l-success/60 bg-success/[0.04]"
            : isStale
              ? "border-l-[3px] border-l-warning/60 bg-warning/[0.04]"
              : hasExistingPlan
                ? "border-l-[3px] border-l-accent/40 bg-accent/[0.03]"
                : "border-border"
        }
      >
        <div id="whole-quote-plan" className="scroll-mt-20">
          <SectionHeading
            title="Whole-quote execution plan"
            description={description}
            actions={statusBadge}
          />

          {phase === "generating" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
              <RefreshCw className="size-3.5 animate-spin" />
              Generating whole-quote proposal…
            </div>
          )}
          {phase === "loading_drafts" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
              <RefreshCw className="size-3.5 animate-spin" />
              Loading per-line draft tasks…
            </div>
          )}
          {phase === "proposal_ready" && proposal && (
            <div className="mt-3 rounded-md border border-border bg-background/60 p-3">
              <p className="text-xs font-medium text-foreground">Proposal ready for review</p>
              <p className="mt-1 text-xs text-foreground-muted">
                {proposalTaskCount} task{proposalTaskCount === 1 ? "" : "s"} proposed.
                {proposal.summary ? ` ${proposal.summary}` : " Open the review panel before applying."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setReviewPanelOpen(true)}
                  className={primaryButtonClass}
                >
                  <Eye className="size-3.5" />
                  Review proposal
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={clearProposal}
                  className={secondaryButtonClass}
                >
                  Discard proposal
                </button>
              </div>
            </div>
          )}
          {phase === "applying" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
              <RefreshCw className="size-3.5 animate-spin" />
              Applying reviewed proposal to execution task list…
            </div>
          )}
          {phase === "accepting" && (
            <div className="mt-3 flex items-center gap-2 text-xs text-foreground-muted">
              <RefreshCw className="size-3.5 animate-spin" />
              Accepting plan…
            </div>
          )}

          {phase === "idle" && canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setManualTaskOpen(true)}
                className={primaryButtonClass}
              >
                <Plus className="size-3.5" />
                Add task manually
              </button>

              {!hasExistingPlan && draftTaskCount > 0 && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleBuildFromDrafts}
                  className={secondaryButtonClass}
                >
                  <ClipboardList className="size-3.5" />
                  Build from line drafts ({draftTaskCount})
                </button>
              )}

              {!hasExistingPlan && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleGenerateProposal}
                  className={secondaryButtonClass}
                >
                  <Bot className="size-3.5" />
                  Generate AI proposal
                </button>
              )}

              {hasExistingPlan && isStale && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleGenerateProposal}
                  className={secondaryButtonClass}
                >
                  <Bot className="size-3.5" />
                  Regenerate AI proposal
                </button>
              )}

              {hasExistingPlan && !isStale && !planAccepted && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleAccept}
                  className={primaryButtonClass}
                >
                  <ShieldCheck className="size-3.5" />
                  Accept plan
                </button>
              )}
            </div>
          )}

          {fallbackWarning && phase !== "proposal_ready" && (
            <div className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/[0.06] px-3 py-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <p className="text-xs text-warning">
                AI unavailable — seeded from per-line tasks. {fallbackWarning}
              </p>
            </div>
          )}

          {error && (
            <p
              className="mt-2 rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-1.5 text-xs text-danger"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      </WorkspacePanel>

      <QuoteExecutionPlanProposalReviewPanel
        open={reviewPanelOpen}
        onClose={() => setReviewPanelOpen(false)}
        proposal={proposal}
        stages={stages}
        stageNameById={stageNameById}
        lineLabelById={lineLabelById}
        hasExistingPlan={hasExistingPlan}
        isApplying={phase === "applying"}
        proposalSource={proposalSource}
        usedFallback={Boolean(fallbackWarning)}
        fallbackReason={fallbackWarning}
        onApply={handleApplyProposal}
      />

      <QuotePlanManualTaskDialog
        open={manualTaskOpen}
        onClose={() => setManualTaskOpen(false)}
        quoteId={quoteId}
        stages={stages}
        scopeLines={scopeLines}
      />
    </>
  );
}
