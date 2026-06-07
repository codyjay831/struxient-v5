"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  applyQuoteExecutionReviewAIProposalAction,
  generateQuoteExecutionReviewAIProposalAction,
} from "@/app/(workspace)/quotes/quote-execution-secretary-actions";
import { useQuoteExecutionReviewFocusOptional } from "@/components/quotes/quote-execution-review-focus";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import type {
  QuoteExecutionReviewOperation,
  QuoteExecutionReviewProposal,
} from "@/lib/ai/quote-execution-review-proposal-schema";
import type { UnresolvedWiringOrphan } from "@/lib/ai/signal-suggester";
import { CheckSquare, Loader2, ShieldAlert, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import type { QuoteExecutionReviewMode } from "@/app/(workspace)/quotes/quote-execution-secretary-actions";

const triggerButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-surface px-4 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-50";

const applyButtonClass =
  "rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-contrast disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

export type QuoteCrossLineWiringReviewState = {
  quoteId: string;
  isReviewing: boolean;
  isOpen: boolean;
  reviewError: string | null;
  proposal: QuoteExecutionReviewProposal | null;
  unresolvedOrphans: UnresolvedWiringOrphan[];
  selectedOperationIds: string[];
  isApplying: boolean;
  startReview: () => Promise<void>;
  toggleOperation: (opId: string) => void;
  applySelected: () => Promise<void>;
  selectAllOperations: () => void;
  clearOperationSelection: () => void;
  closeReview: () => void;
};

const QuoteCrossLineWiringReviewContext =
  createContext<QuoteCrossLineWiringReviewState | null>(null);

function operationCountLabel(count: number): string {
  if (count === 1) {
    return "1 suggested change";
  }
  return `${count} suggested changes`;
}

function mergeExecutionReviewProposals(
  quoteId: string,
  signalProposal: QuoteExecutionReviewProposal,
  taskProposal: QuoteExecutionReviewProposal,
): QuoteExecutionReviewProposal {
  const operationsById = new Map<string, QuoteExecutionReviewOperation>();
  for (const operation of [...signalProposal.operations, ...taskProposal.operations]) {
    operationsById.set(operation.opId, operation);
  }
  return {
    quoteId,
    summary: [signalProposal.summary, taskProposal.summary].filter(Boolean).join(" "),
    assumptions: [...new Set([...signalProposal.assumptions, ...taskProposal.assumptions])],
    warnings: [...new Set([...signalProposal.warnings, ...taskProposal.warnings])],
    missingContext: [...new Set([...signalProposal.missingContext, ...taskProposal.missingContext])],
    operations: [...operationsById.values()],
    consolidationHints: [...signalProposal.consolidationHints, ...taskProposal.consolidationHints],
    manualDecisions: [...signalProposal.manualDecisions, ...taskProposal.manualDecisions],
  };
}

function useQuoteCrossLineWiringReviewState(quoteId: string): QuoteCrossLineWiringReviewState {
  const router = useRouter();
  const [isReviewing, setIsReviewing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<QuoteExecutionReviewProposal | null>(null);
  const [unresolvedOrphans, setUnresolvedOrphans] = useState<UnresolvedWiringOrphan[]>([]);
  const [selectedOperationIds, setSelectedOperationIds] = useState<string[]>([]);
  const [generation, setGeneration] = useState<AILibraryProposalGenerationMeta | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const startReview = useCallback(async () => {
    setIsReviewing(true);
    setReviewError(null);
    try {
      const [signalResult, taskResult] = await Promise.all([
        generateQuoteExecutionReviewAIProposalAction(quoteId, {
          mode: "signals" satisfies QuoteExecutionReviewMode,
        }),
        generateQuoteExecutionReviewAIProposalAction(quoteId, {
          mode: "tasks" satisfies QuoteExecutionReviewMode,
        }),
      ]);
      if (!signalResult.ok || !taskResult.ok) {
        const errors = [signalResult, taskResult]
          .filter((result): result is { ok: false; error: string } => !result.ok)
          .map((result) => result.error);
        const message =
          errors.length > 1
            ? `Could not complete AI review: ${errors.join(" | ")}`
            : errors[0] ?? "Could not complete AI review. Try again.";
        setReviewError(message);
        toast.error(message);
        return;
      }
      const mergedProposal = mergeExecutionReviewProposals(
        quoteId,
        signalResult.proposal,
        taskResult.proposal,
      );
      setProposal(mergedProposal);
      setUnresolvedOrphans(signalResult.unresolvedOrphans);
      setSelectedOperationIds([]);
      setGeneration(signalResult.generation);
      setIsOpen(true);
      scrollCrossLineReviewPanelIntoView();
    } catch {
      const message = "Could not run AI Secretary review. Try again.";
      setReviewError(message);
      toast.error(message);
    } finally {
      setIsReviewing(false);
    }
  }, [quoteId]);

  const toggleOperation = useCallback((opId: string) => {
    setSelectedOperationIds((prev) =>
      prev.includes(opId) ? prev.filter((id) => id !== opId) : [...prev, opId],
    );
  }, []);

  const applySelected = useCallback(async () => {
    if (!proposal) {
      return;
    }
    if (selectedOperationIds.length === 0) {
      toast.error("Select at least one suggested change to apply.");
      return;
    }
    setIsApplying(true);
    try {
      const result = await applyQuoteExecutionReviewAIProposalAction(
        quoteId,
        proposal,
        selectedOperationIds,
        generation ?? undefined,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.warnings.length > 0) {
        toast.warning(result.warnings[0]);
      }
      toast.success("Applied AI Secretary changes to the quote work plan.");
      router.refresh();
    } catch {
      toast.error("Could not apply AI Secretary changes. Try again.");
    } finally {
      setIsApplying(false);
    }
  }, [generation, proposal, quoteId, router, selectedOperationIds]);

  const selectAllOperations = useCallback(() => {
    setSelectedOperationIds(proposal?.operations.map((op) => op.opId) ?? []);
  }, [proposal]);

  const clearOperationSelection = useCallback(() => {
    setSelectedOperationIds([]);
  }, []);

  const closeReview = useCallback(() => {
    setIsOpen(false);
    setProposal(null);
    setUnresolvedOrphans([]);
    setSelectedOperationIds([]);
  }, []);

  return useMemo(
    () => ({
      quoteId,
      isReviewing,
      isOpen,
      reviewError,
      proposal,
      unresolvedOrphans,
      selectedOperationIds,
      isApplying,
      startReview,
      toggleOperation,
      applySelected,
      selectAllOperations,
      clearOperationSelection,
      closeReview,
    }),
    [
      quoteId,
      isReviewing,
      isOpen,
      reviewError,
      proposal,
      unresolvedOrphans,
      selectedOperationIds,
      isApplying,
      startReview,
      toggleOperation,
      applySelected,
      selectAllOperations,
      clearOperationSelection,
      closeReview,
    ],
  );
}

export function QuoteCrossLineWiringReviewScope({
  quoteId,
  children,
}: {
  quoteId: string;
  children: ReactNode;
}) {
  const state = useQuoteCrossLineWiringReviewState(quoteId);
  return (
    <QuoteCrossLineWiringReviewContext.Provider value={state}>
      {children}
    </QuoteCrossLineWiringReviewContext.Provider>
  );
}

export function useQuoteCrossLineWiringReviewContextOptional(): QuoteCrossLineWiringReviewState | null {
  return useContext(QuoteCrossLineWiringReviewContext);
}

export function useQuoteCrossLineWiringReviewContext(): QuoteCrossLineWiringReviewState {
  const context = useQuoteCrossLineWiringReviewContextOptional();
  if (!context) {
    throw new Error(
      "Quote cross-line wiring review components must be used within QuoteCrossLineWiringReviewScope.",
    );
  }
  return context;
}

function scrollCrossLineReviewPanelIntoView() {
  requestAnimationFrame(() => {
    document.getElementById("cross-line-wiring-review")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

export function QuoteCrossLineWiringReviewTrigger({
  label = "Review whole execution flow",
  compact = false,
}: {
  label?: string;
  compact?: boolean;
}) {
  const { isReviewing, startReview } = useQuoteCrossLineWiringReviewContext();

  return (
    <button
      type="button"
      onClick={() => void startReview()}
      disabled={isReviewing}
      className={
        compact
          ? "inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-50"
          : triggerButtonClass
      }
    >
      {isReviewing ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-3" aria-hidden />
      )}
      {label}
    </button>
  );
}

function OperationRow({
  operation,
  selected,
  onToggle,
}: {
  operation: QuoteExecutionReviewOperation;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected
          ? "border-accent/40 bg-accent/5"
          : "border-border bg-surface hover:border-border-strong hover:bg-foreground/[0.02]"
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {selected ? <CheckSquare className="size-4 text-accent" /> : <Square className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {operation.type === "add_task" ? (
          <>
            <p className="text-xs font-bold text-foreground">Suggested task addition</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Add <span className="font-semibold text-foreground">&ldquo;{operation.task.title}&rdquo;</span>{" "}
              on this line with stage <span className="font-mono">{operation.task.stageId}</span>.
            </p>
          </>
        ) : (
          <>
            <p className="text-xs font-bold text-foreground">Suggested signal patch</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Update task <span className="font-mono">{operation.taskId}</span> signals to resolve
              cross-line readiness gaps.
            </p>
          </>
        )}
        {operation.reason ? (
          <p className="mt-1 text-[10px] text-foreground-subtle">{operation.reason}</p>
        ) : null}
      </div>
    </button>
  );
}

function ExecutionReviewOperationList({
  operations,
  selectedOperationIds,
  onToggle,
}: {
  operations: QuoteExecutionReviewOperation[];
  selectedOperationIds: string[];
  onToggle: (opId: string) => void;
}) {
  if (operations.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      {operations.map((operation) => (
        <OperationRow
          key={operation.opId}
          operation={operation}
          selected={selectedOperationIds.includes(operation.opId)}
          onToggle={() => onToggle(operation.opId)}
        />
      ))}
    </div>
  );
}

function UnresolvedWiringOrphanList({
  orphans,
}: {
  orphans: readonly UnresolvedWiringOrphan[];
}) {
  const focusContext = useQuoteExecutionReviewFocusOptional();
  if (orphans.length === 0) {
    return null;
  }
  return (
    <div className="space-y-3">
      {orphans.map((orphan) => (
        <div
          key={`${orphan.consumerTaskId}:${orphan.signal}`}
          className="flex items-start gap-3 rounded-lg border border-warning/30 bg-surface p-3"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground">Unresolved dependency gap</p>
            <p className="mt-1 text-xs text-foreground-muted">
              <span className="font-semibold text-foreground">
                &ldquo;{orphan.consumerTaskTitle}&rdquo;
              </span>{" "}
              requires{" "}
              <span className="rounded bg-accent/10 px-1 py-0.5 font-mono text-[10px] font-bold text-accent">
                {orphan.signal}
              </span>
              , and no provider task is currently available on this quote.
            </p>
            <p className="mt-1 text-[10px] text-foreground-subtle">
              Line: {orphan.consumerLineDescription}
            </p>
          </div>
          {focusContext ? (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => focusContext.focusTask(orphan.consumerLineId, orphan.consumerTaskId)}
            >
              Edit task
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ConsolidationHints({
  hints,
}: {
  hints: QuoteExecutionReviewProposal["consolidationHints"];
}) {
  if (hints.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      {hints.map((hint) => (
        <div key={hint.hintId} className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-bold text-foreground">{hint.title}</p>
          <p className="mt-1 text-xs text-foreground-muted">{hint.recommendation}</p>
          <p className="mt-1 text-[10px] text-foreground-subtle">Tasks: {hint.taskIds.join(", ")}</p>
        </div>
      ))}
    </div>
  );
}

function ManualDecisionList({
  decisions,
}: {
  decisions: QuoteExecutionReviewProposal["manualDecisions"];
}) {
  if (decisions.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      {decisions.map((decision) => (
        <div key={decision.decisionId} className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <p className="text-xs font-bold text-foreground">{decision.title}</p>
          <p className="mt-1 text-xs text-foreground-muted">{decision.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function QuoteCrossLineWiringReviewPanel({
  footer,
}: {
  footer?: ReactNode;
}) {
  const {
    isOpen,
    reviewError,
    proposal,
    unresolvedOrphans,
    selectedOperationIds,
    isApplying,
    toggleOperation,
    applySelected,
    selectAllOperations,
    clearOperationSelection,
    closeReview,
  } = useQuoteCrossLineWiringReviewContext();

  if (!isOpen) {
    return null;
  }

  const operations = proposal?.operations ?? [];
  const operationCount = operations.length;
  const taskAdditionOperations = operations.filter((operation) => operation.type === "add_task");
  const signalPatchOperations = operations.filter(
    (operation) => operation.type === "patch_task_signals",
  );
  const orphanCount = unresolvedOrphans.length;
  const consolidationCount = proposal?.consolidationHints.length ?? 0;
  const manualDecisionCount = proposal?.manualDecisions.length ?? 0;

  return (
    <div
      id="cross-line-wiring-review"
      className="mb-4 scroll-mt-20 rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden />
          <h3 className="text-sm font-semibold text-foreground">AI Secretary review</h3>
        </div>
        <button
          type="button"
          onClick={closeReview}
          className="text-xs font-medium text-foreground-subtle transition-colors hover:text-foreground"
        >
          Close
        </button>
      </div>

      {reviewError ? (
        <p
          className="mb-4 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
          role="alert"
          aria-live="polite"
        >
          {reviewError}
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-foreground-muted">
        {operationCount > 0 ? (
          <>
            Analyzed all line items together and generated{" "}
            <strong>{operationCountLabel(operationCount)}</strong> you can review before applying.
          </>
        ) : orphanCount > 0 ? (
          <>
            Analyzed all line items together. Found{" "}
            <strong>
              {orphanCount} unresolved dependency gap{orphanCount === 1 ? "" : "s"}
            </strong>{" "}
            that still require manual edits.
          </>
        ) : (
          <>No whole-quote execution changes are needed right now.</>
        )}
      </p>

      {proposal?.warnings.length ? (
        <div className="mt-3 rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-foreground-subtle">Warnings</p>
          <ul className="mt-1 space-y-1 text-xs text-foreground-muted">
            {proposal.warnings.map((warning) => (
              <li key={warning}>· {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {operationCount > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={secondaryButtonClass} onClick={selectAllOperations}>
              Select all
            </button>
            <button type="button" className={secondaryButtonClass} onClick={clearOperationSelection}>
              Clear selection
            </button>
            <button
              type="button"
              className={applyButtonClass}
              disabled={selectedOperationIds.length === 0 || isApplying}
              onClick={() => void applySelected()}
            >
              {isApplying ? "Applying…" : `Apply selected (${selectedOperationIds.length})`}
            </button>
          </div>
          {taskAdditionOperations.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-bold text-foreground">Suggested task additions</p>
              <ExecutionReviewOperationList
                operations={taskAdditionOperations}
                selectedOperationIds={selectedOperationIds}
                onToggle={toggleOperation}
              />
            </div>
          ) : null}
          {signalPatchOperations.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-bold text-foreground">Signal fixes</p>
              <ExecutionReviewOperationList
                operations={signalPatchOperations}
                selectedOperationIds={selectedOperationIds}
                onToggle={toggleOperation}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {manualDecisionCount > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-bold text-foreground">Needs your decision</p>
          <ManualDecisionList decisions={proposal?.manualDecisions ?? []} />
        </div>
      ) : null}

      {consolidationCount > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-bold text-foreground">Possible consolidations</p>
          <ConsolidationHints hints={proposal?.consolidationHints ?? []} />
        </div>
      ) : null}

      {orphanCount > 0 ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-bold text-foreground">Unresolved gaps</p>
          <UnresolvedWiringOrphanList orphans={unresolvedOrphans} />
        </div>
      ) : null}

      {footer ? <div className="mt-4 flex flex-wrap items-center gap-3">{footer}</div> : null}
    </div>
  );
}
