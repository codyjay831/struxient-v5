"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Loader2, Sparkles, X } from "lucide-react";
import type {
  PaymentScheduleMilestoneSuggestion,
  QuotePaymentScheduleGenerationMeta,
  QuotePaymentScheduleProposal,
} from "@/lib/ai/quote-payment-schedule-proposal-schema";
import {
  formatMoneyCents,
  formatPaymentAnchorLabel,
} from "@/lib/quote-display";
import { materializePercentageToCents } from "@/lib/payment-schedule-materialization";
import {
  workspaceFormControlClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const controlClass = workspaceFormControlClass;
const fieldLabelClass = workspaceFormFieldLabelClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;

function subscribeNoop() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

function resolveMilestonePreviewCents(
  milestone: PaymentScheduleMilestoneSuggestion,
  quoteTotalCents: number,
): string {
  if (milestone.anchorType === "FINAL_BALANCE") {
    return "Remainder";
  }
  if (milestone.amountCents != null) {
    return formatMoneyCents(milestone.amountCents);
  }
  if (milestone.percentage) {
    const materialized = materializePercentageToCents(quoteTotalCents, milestone.percentage);
    if (materialized.ok) {
      return `${milestone.percentage}% (${formatMoneyCents(materialized.amountCents)})`;
    }
    return `${milestone.percentage}%`;
  }
  return "Amount TBD";
}

export type QuotePaymentScheduleAiReviewPanelProps = {
  open: boolean;
  onClose: () => void;
  quoteTotalCents: number;
  hasExistingSchedule: boolean;
  userInstructions: string;
  onUserInstructionsChange: (value: string) => void;
  proposal: QuotePaymentScheduleProposal | null;
  generation: QuotePaymentScheduleGenerationMeta | null;
  isGenerating: boolean;
  isApplying: boolean;
  onGenerate: () => Promise<void>;
  onApply: (params: {
    selectedMilestoneTempIds: string[];
    replaceConfirmed: boolean;
  }) => Promise<void>;
};

export function QuotePaymentScheduleAiReviewPanel({
  open,
  onClose,
  quoteTotalCents,
  hasExistingSchedule,
  userInstructions,
  onUserInstructionsChange,
  proposal,
  generation,
  isGenerating,
  isApplying,
  onGenerate,
  onApply,
}: QuotePaymentScheduleAiReviewPanelProps) {
  const mounted = useIsClientMounted();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedTempIds, setSelectedTempIds] = useState<Set<string>>(new Set());
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [prevProposal, setPrevProposal] = useState(proposal);
  const canClose = !isApplying && !isGenerating;

  if (proposal !== prevProposal) {
    setPrevProposal(proposal);
    if (!proposal) {
      setSelectedTempIds(new Set());
      setReplaceConfirmed(false);
    } else {
      setSelectedTempIds(new Set(proposal.milestones.map((item) => item.tempId)));
      setReplaceConfirmed(false);
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleCancel(event: Event) {
      if (!canClose) {
        event.preventDefault();
        return;
      }
      onClose();
    }

    function handleClose() {
      if (open) onClose();
    }

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("close", handleClose);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("close", handleClose);
    };
  }, [canClose, onClose, open]);

  const toggleMilestone = (tempId: string) => {
    setSelectedTempIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const handleApply = async () => {
    await onApply({
      selectedMilestoneTempIds: [...selectedTempIds],
      replaceConfirmed,
    });
  };

  const applyDisabled =
    isApplying ||
    isGenerating ||
    selectedTempIds.size === 0 ||
    (hasExistingSchedule && !replaceConfirmed) ||
    (generation != null && !generation.canApply);

  const dialogNode = (
    <dialog
      ref={dialogRef}
      data-workspace-child-dialog="true"
      aria-labelledby="payment-schedule-ai-title"
      aria-busy={isApplying || isGenerating}
      className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-2xl outline-none [&::backdrop]:bg-black/40 [&:not([open])]:hidden"
      onClick={(e) => {
        if (!canClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="payment-schedule-ai-title" className="text-base font-semibold text-foreground">
              Plan payment schedule with AI
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              Proposes deposit, progress, and final milestones from scope, execution plan, and quote context.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="rounded-lg border border-border p-2 text-foreground-subtle hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {generation?.isSimulated ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              Demo AI output — review carefully before applying.
            </div>
          ) : null}

          <label className="block">
            <span className={fieldLabelClass}>Additional instructions (optional)</span>
            <textarea
              value={userInstructions}
              onChange={(e) => onUserInstructionsChange(e.target.value)}
              rows={3}
              placeholder="e.g. 50% deposit, pay final at inspection..."
              className={`${controlClass} mt-1 text-sm`}
            />
          </label>

          {proposal?.scheduleRationale ? (
            <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className={fieldLabelClass}>Schedule rationale</p>
              <p className="mt-1 text-sm text-foreground-muted">{proposal.scheduleRationale}</p>
            </div>
          ) : null}

          {proposal?.assumptions && proposal.assumptions.length > 0 ? (
            <div className="space-y-1">
              <p className={fieldLabelClass}>Assumptions</p>
              <ul className="space-y-1 text-xs text-foreground-muted">
                {proposal.assumptions.map((item) => (
                  <li key={item} className="flex gap-2">
                    <InfoDot />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {proposal?.warnings && proposal.warnings.length > 0 ? (
            <div className="space-y-1">
              <p className={fieldLabelClass}>Warnings</p>
              <ul className="space-y-1 text-xs text-warning">
                {proposal.warnings.map((item) => (
                  <li key={item} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {proposal?.missingInfo && proposal.missingInfo.length > 0 ? (
            <div className="space-y-1">
              <p className={fieldLabelClass}>Missing info</p>
              <ul className="space-y-1 text-xs text-foreground-muted">
                {proposal.missingInfo.map((item) => (
                  <li key={item} className="flex gap-2">
                    <InfoDot />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {proposal && proposal.milestones.length > 0 ? (
            <div className="space-y-2">
              <p className={fieldLabelClass}>Proposed milestones</p>
              {proposal.milestones.map((milestone) => {
                const selected = selectedTempIds.has(milestone.tempId);
                return (
                  <label
                    key={milestone.tempId}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      selected
                        ? "border-accent/40 bg-accent/[0.03]"
                        : "border-border bg-surface hover:border-border-strong"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleMilestone(milestone.tempId)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{milestone.title}</p>
                          <p className="text-xs text-foreground-muted">
                            {formatPaymentAnchorLabel(
                              milestone.anchorType,
                              milestone.anchorStageName ?? null,
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {resolveMilestonePreviewCents(milestone, quoteTotalCents)}
                        </p>
                      </div>
                      {milestone.reasoning ? (
                        <p className="mt-1 text-xs text-foreground-subtle">{milestone.reasoning}</p>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>
          ) : !isGenerating ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">
              Generate a proposal to review milestones before applying.
            </div>
          ) : null}

          {hasExistingSchedule ? (
            <label className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-foreground">
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(e) => setReplaceConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Replace existing schedule — applying will remove current milestones and create the selected AI milestones.
              </span>
            </label>
          ) : null}

          {generation && !generation.canApply && generation.applyBlockedReason ? (
            <p className="text-xs text-warning">{generation.applyBlockedReason}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || isApplying}
            className={`${secondaryButtonClass} inline-flex items-center gap-2`}
          >
            {isGenerating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {proposal ? "Regenerate" : "Generate"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={!canClose}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applyDisabled}
              className={`${primaryButtonClass} inline-flex items-center gap-2`}
            >
              {isApplying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Apply selected
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );

  if (!mounted || !open) return null;
  return createPortal(dialogNode, document.body);
}

function InfoDot() {
  return <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground-subtle" />;
}
