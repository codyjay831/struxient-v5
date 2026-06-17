"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, CheckCircle2, CircleDashed, RefreshCw, ShieldCheck } from "lucide-react";
import {
  generateQuoteExecutionPlanProposalAction,
  applyQuoteExecutionPlanProposalAction,
  acceptQuoteExecutionPlanAction,
} from "@/app/(workspace)/quotes/quote-plan-actions";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SectionHeading } from "@/components/ui/section-heading";
import type { QuotePlanProposal } from "@/lib/quote-plan/quote-plan-proposal-schema";

type PlanStatus = "DRAFT" | "READY_FOR_REVIEW" | "ACCEPTED";

type GeneratingPhase = "idle" | "generating" | "proposal_ready" | "applying" | "accepting";

export function QuotePlanControlPanel({
  quoteId,
  executionPlan,
  isStale,
  canEdit,
}: {
  quoteId: string;
  executionPlan: {
    status: PlanStatus;
    planVersion: number;
    taskCount: number;
  } | null;
  isStale: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<GeneratingPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);
  const [proposal, setProposal] = useState<QuotePlanProposal | null>(null);
  const [proposalSummary, setProposalSummary] = useState<string | null>(null);
  const [proposalTaskCount, setProposalTaskCount] = useState(0);
  const [, startTransition] = useTransition();

  const hasExistingPlan = executionPlan !== null;
  const planAccepted = executionPlan?.status === "ACCEPTED";
  const planReadyForReview = executionPlan?.status === "READY_FOR_REVIEW";

  function handleGenerateProposal() {
    setError(null);
    setFallbackWarning(null);
    setProposal(null);
    setProposalSummary(null);
    setProposalTaskCount(0);
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
      setProposalSummary(genResult.proposal.summary || null);
      setProposalTaskCount(
        genResult.proposal.operations.filter((operation) => operation.type === "ADD_TASK").length,
      );
      setPhase("proposal_ready");
    });
  }

  function handleApplyProposal() {
    if (!proposal) {
      setError("Generate a proposal before applying.");
      return;
    }
    setError(null);
    setPhase("applying");
    startTransition(async () => {
      const applyResult = await applyQuoteExecutionPlanProposalAction(quoteId, proposal, {
        applyMode: "replace_unprotected",
      });
      if (!applyResult.ok) {
        setError(applyResult.error);
        setPhase("proposal_ready");
        return;
      }
      setProposal(null);
      setProposalSummary(null);
      setProposalTaskCount(0);
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
    phase === "generating" || phase === "applying" || phase === "accepting";

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
          ? "Stale — inputs changed"
          : planReadyForReview
            ? "Ready for review"
            : "Draft"}
    </span>
  ) : null;

  const description = !hasExistingPlan
    ? "No whole-quote plan yet. Generate a coordinated AI plan — or seed from existing per-line tasks if AI is unavailable."
    : planAccepted && !isStale
      ? `Plan v${executionPlan.planVersion} is accepted. ${executionPlan.taskCount} tasks cover all execution-relevant scope.`
      : isStale
        ? `Plan inputs changed since last acceptance. Re-accept to stamp the current planning context and unblock activation.`
        : planReadyForReview
          ? `Plan v${executionPlan.planVersion} is ready for review — accept it to unlock job activation.`
          : `Plan v${executionPlan.planVersion} is a draft with ${executionPlan.taskCount} tasks. Accept to enable activation.`;

  return (
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
      {phase === "proposal_ready" && proposal && (
        <div className="mt-3 rounded-md border border-border bg-background/60 p-3">
          <p className="text-xs font-medium text-foreground">Proposal ready for review</p>
          <p className="mt-1 text-xs text-foreground-muted">
            {proposalTaskCount} task{proposalTaskCount === 1 ? "" : "s"} will be added or reconciled.
            Review then apply.
          </p>
          {proposalSummary ? (
            <p className="mt-1 text-xs text-foreground-muted">Summary: {proposalSummary}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={handleApplyProposal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Apply proposal
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setProposal(null);
                setProposalSummary(null);
                setProposalTaskCount(0);
                setPhase("idle");
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
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
          {!hasExistingPlan && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleGenerateProposal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Bot className="size-3.5" />
              Generate proposal
            </button>
          )}

          {hasExistingPlan && isStale && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleGenerateProposal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Bot className="size-3.5" />
              Regenerate proposal
            </button>
          )}

          {hasExistingPlan && !isStale && !planAccepted && (
            <button
              type="button"
              disabled={isPending}
              onClick={handleAccept}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShieldCheck className="size-3.5" />
              Accept plan
            </button>
          )}
        </div>
      )}

      {fallbackWarning && (
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
    </WorkspacePanel>
  );
}
