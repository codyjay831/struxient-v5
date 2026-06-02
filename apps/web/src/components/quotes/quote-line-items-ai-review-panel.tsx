"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Loader2, X } from "lucide-react";
import type {
  CommercialLineItemSuggestion,
  QuoteScopeSuggestionsGenerationMeta,
  QuoteScopeSuggestionsProposal,
  RecommendedTemplateSuggestion,
} from "@/lib/ai/quote-line-items-proposal-schema";
import type { QuoteScopeCaptureSourceFlags } from "@/lib/ai/quote-scope-capture-context";
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

function confidenceLabel(confidence: string): string {
  if (confidence === "high") return "High match";
  if (confidence === "low") return "Low match";
  return "Medium match";
}

export type QuoteScopeCapturePanelProps = {
  open: boolean;
  onClose: () => void;
  hasIntakeNotes: boolean;
  hasInternalNotes: boolean;
  hasScopeSummary: boolean;
  captureText: string;
  onCaptureTextChange: (value: string) => void;
  additionalInstructions: string;
  onAdditionalInstructionsChange: (value: string) => void;
  sources: QuoteScopeCaptureSourceFlags;
  onSourcesChange: (sources: QuoteScopeCaptureSourceFlags) => void;
  proposal: QuoteScopeSuggestionsProposal | null;
  generation: QuoteScopeSuggestionsGenerationMeta | null;
  isGenerating: boolean;
  isApplying: boolean;
  onGenerate: () => Promise<void>;
  onApply: (params: {
    selectedTemplateIds: string[];
    selectedCommercialLineItems: CommercialLineItemSuggestion[];
    selectedOptionalAddOnIds: string[];
    selectedQuoteJobContext: string[];
  }) => Promise<void>;
};

export function QuoteScopeCapturePanel({
  open,
  onClose,
  hasIntakeNotes,
  hasInternalNotes,
  hasScopeSummary,
  captureText,
  onCaptureTextChange,
  additionalInstructions,
  onAdditionalInstructionsChange,
  sources,
  onSourcesChange,
  proposal,
  generation,
  isGenerating,
  isApplying,
  onGenerate,
  onApply,
}: QuoteScopeCapturePanelProps) {
  const mounted = useIsClientMounted();
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [selectedCommercialIds, setSelectedCommercialIds] = useState<Set<string>>(new Set());
  const [selectedOptionalIds, setSelectedOptionalIds] = useState<Set<string>>(new Set());
  const [editedCommercial, setEditedCommercial] = useState<CommercialLineItemSuggestion[]>([]);
  const [selectedQuoteJobContext, setSelectedQuoteJobContext] = useState<Set<string>>(new Set());
  const [prevProposal, setPrevProposal] = useState(proposal);

  if (proposal !== prevProposal) {
    setPrevProposal(proposal);
    if (!proposal) {
      setSelectedTemplateIds(new Set());
      setSelectedCommercialIds(new Set());
      setSelectedOptionalIds(new Set());
      setEditedCommercial([]);
      setSelectedQuoteJobContext(new Set());
    } else {
      setSelectedTemplateIds(new Set(proposal.recommendedTemplates.map((t) => t.templateId)));
      setSelectedCommercialIds(new Set(proposal.commercialLineItems.map((item) => item.tempId)));
      setSelectedOptionalIds(new Set());
      setEditedCommercial(proposal.commercialLineItems.map((item) => ({ ...item })));
      setSelectedQuoteJobContext(new Set(proposal.quoteJobContext));
    }
  }

  if (!open || !mounted) return null;

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  const toggleCommercial = (tempId: string) => {
    setSelectedCommercialIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const toggleQuoteJobContext = (item: string) => {
    setSelectedQuoteJobContext((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const toggleOptional = (tempId: string) => {
    setSelectedOptionalIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const updateCommercial = (tempId: string, patch: Partial<CommercialLineItemSuggestion>) => {
    setEditedCommercial((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)),
    );
  };

  const handleApply = async () => {
    const selectedCommercialLineItems = editedCommercial.filter((item) =>
      selectedCommercialIds.has(item.tempId),
    );

    await onApply({
      selectedTemplateIds: [...selectedTemplateIds],
      selectedCommercialLineItems,
      selectedOptionalAddOnIds: [...selectedOptionalIds],
      selectedQuoteJobContext: [...selectedQuoteJobContext],
    });
  };

  const selectedCount =
    selectedTemplateIds.size +
    selectedCommercialIds.size +
    selectedOptionalIds.size +
    selectedQuoteJobContext.size;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scope-capture-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="scope-capture-title" className="text-base font-semibold text-foreground">
              Quick scope capture
            </h2>
            <p className="mt-1 text-xs text-foreground-muted">
              Group messy notes into parent commercial scope. Details stay on the line — not separate rows.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border p-2 text-foreground-subtle hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <label className="block">
            <span className={fieldLabelClass}>Describe the work, even messy</span>
            <textarea
              value={captureText}
              onChange={(e) => onCaptureTextChange(e.target.value)}
              rows={4}
              placeholder="Paste notes, type fast, or summarize what the customer wants..."
              className={`${controlClass} mt-1 text-sm`}
            />
          </label>

          <div className="rounded-lg border border-border bg-foreground/[0.02] p-3 space-y-2">
            <p className={fieldLabelClass}>Include context</p>
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              <input
                type="checkbox"
                checked={sources.includeIntakeNotes !== false}
                disabled={!hasIntakeNotes}
                onChange={(e) =>
                  onSourcesChange({ ...sources, includeIntakeNotes: e.target.checked })
                }
              />
              Intake / customer notes
              {!hasIntakeNotes ? (
                <span className="text-foreground-subtle">(none available)</span>
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              <input
                type="checkbox"
                checked={sources.includeInternalQuoteNotes !== false}
                disabled={!hasInternalNotes}
                onChange={(e) =>
                  onSourcesChange({ ...sources, includeInternalQuoteNotes: e.target.checked })
                }
              />
              Internal quote notes
              {!hasInternalNotes ? (
                <span className="text-foreground-subtle">(none available)</span>
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground-muted">
              <input
                type="checkbox"
                checked={sources.includeScopeSummary !== false}
                disabled={!hasScopeSummary}
                onChange={(e) =>
                  onSourcesChange({ ...sources, includeScopeSummary: e.target.checked })
                }
              />
              Lead scope summary
              {!hasScopeSummary ? (
                <span className="text-foreground-subtle">(none available)</span>
              ) : null}
            </label>
          </div>

          <label className="block">
            <span className={fieldLabelClass}>Additional instructions (optional)</span>
            <textarea
              value={additionalInstructions}
              onChange={(e) => onAdditionalInstructionsChange(e.target.value)}
              rows={2}
              className={`${controlClass} mt-1 text-sm`}
              placeholder="Anything else the suggestions should consider..."
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButtonClass}
              disabled={isGenerating}
              onClick={() => void onGenerate()}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Drafting suggestions…
                </>
              ) : (
                "Draft scope suggestions"
              )}
            </button>
          </div>

          {generation?.isSimulated ? (
            <p className="rounded-md border border-border bg-foreground/[0.02] px-3 py-2 text-xs text-foreground-muted">
              Demo output — live AI provider unavailable.
            </p>
          ) : null}

          {proposal?.warnings && proposal.warnings.length > 0 ? (
            <div className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground-muted">
                <AlertTriangle className="size-3.5" />
                Warnings
              </div>
              <ul className="mt-1 space-y-1 text-xs text-foreground-muted">
                {proposal.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {proposal &&
          (proposal.quoteJobContext.length > 0 || proposal.quoteMissingInfo.length > 0) ? (
            <section className="space-y-2">
              <p className={fieldLabelClass}>Job-wide context</p>
              <p className="text-[10px] text-foreground-subtle">
                Applies to the whole job — saved to quote internal notes, not repeated on every line.
              </p>
              {proposal.quoteJobContext.length > 0 ? (
                <ul className="space-y-2">
                  {proposal.quoteJobContext.map((item) => (
                    <li
                      key={item}
                      className="rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={selectedQuoteJobContext.has(item)}
                          onChange={() => toggleQuoteJobContext(item)}
                        />
                        <span className="text-sm text-foreground-muted">{item}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
              {proposal.quoteMissingInfo.length > 0 ? (
                <div className="rounded-md border border-border bg-foreground/[0.02] px-3 py-2">
                  <p className="text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle">
                    Quote-wide missing info
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-foreground-muted">
                    {proposal.quoteMissingInfo.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {proposal && proposal.recommendedTemplates.length > 0 ? (
            <section className="space-y-2">
              <p className={fieldLabelClass}>Recommended from Scope Library</p>
              <ul className="space-y-2">
                {proposal.recommendedTemplates.map((item: RecommendedTemplateSuggestion) => (
                  <li
                    key={item.tempId}
                    className="rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedTemplateIds.has(item.templateId)}
                        onChange={() => toggleTemplate(item.templateId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {item.templateDescription}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-foreground-subtle">
                          {confidenceLabel(item.confidence)}
                          {item.reasoning ? ` · ${item.reasoning}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {proposal && editedCommercial.length > 0 ? (
            <section className="space-y-2">
              <p className={fieldLabelClass}>Commercial scope suggestions</p>
              <p className="text-[10px] text-foreground-subtle">
                These details stay on the line item — not separate quote rows.
              </p>
              <ul className="space-y-3">
                {editedCommercial.map((item) => (
                  <li
                    key={item.tempId}
                    className="rounded-lg border border-border bg-surface px-3 py-3 space-y-3"
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedCommercialIds.has(item.tempId)}
                        onChange={() => toggleCommercial(item.tempId)}
                      />
                      <span className="min-w-0 flex-1 space-y-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            updateCommercial(item.tempId, { description: e.target.value })
                          }
                          className={`${controlClass} text-sm font-medium`}
                        />
                        <span className="block text-[10px] text-foreground-subtle">
                          {confidenceLabel(item.confidence)}
                          {item.reasoning ? ` · ${item.reasoning}` : ""}
                          {" · Price not set — you add pricing after apply"}
                        </span>
                      </span>
                    </label>

                    {item.lineItemDetails.length > 0 ? (
                      <div className="ml-6 space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                          Line-specific details
                        </p>
                        <ul className="space-y-1">
                          {item.lineItemDetails.map((detail) => (
                            <li
                              key={detail.tempId}
                              className="text-xs text-foreground-muted rounded border border-border/60 px-2 py-1"
                            >
                              {detail.label ? (
                                <span className="font-medium text-foreground">{detail.label}: </span>
                              ) : null}
                              {detail.content}
                              <span className="ml-1 text-[9px] uppercase text-foreground-subtle">
                                ({detail.audience})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {item.executionPlanningNotes.length > 0 ? (
                      <div className="ml-6 space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                          Execution planning notes
                        </p>
                        <ul className="space-y-1 text-xs text-foreground-muted">
                          {item.executionPlanningNotes.map((note) => (
                            <li key={note}>• {note}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {item.missingInfo.length > 0 ? (
                      <div className="ml-6 space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
                          Missing info (this line)
                        </p>
                        <ul className="space-y-1 text-xs text-foreground-muted">
                          {item.missingInfo.map((info) => (
                            <li key={info}>• {info}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {proposal && proposal.optionalAddOns.length > 0 ? (
            <section className="space-y-2">
              <p className={fieldLabelClass}>Optional add-ons</p>
              <p className="text-[10px] text-foreground-subtle">
                Separate rows — only when scope is optional or independently priced.
              </p>
              <ul className="space-y-2">
                {proposal.optionalAddOns.map((addOn) => (
                  <li
                    key={addOn.tempId}
                    className="rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedOptionalIds.has(addOn.tempId)}
                        onChange={() => toggleOptional(addOn.tempId)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {addOn.description}
                        </span>
                        <span className="mt-0.5 block text-xs text-foreground-muted">
                          {addOn.whySeparate}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-foreground-subtle">
                          {confidenceLabel(addOn.confidence)}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {proposal &&
          proposal.recommendedTemplates.length === 0 &&
          editedCommercial.length === 0 &&
          proposal.optionalAddOns.length === 0 ? (
            <p className="text-xs text-foreground-subtle">
              No scope suggestions yet. Add context and draft suggestions.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4">
          <p className="text-xs text-foreground-subtle">
            {selectedCount > 0
              ? `${selectedCount} selected — added as line items at $0 until you price them`
              : "Select suggestions to add to the quote"}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClass} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={primaryButtonClass}
              disabled={isApplying || selectedCount === 0 || !proposal}
              onClick={() => void handleApply()}
            >
              {isApplying ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Add selected to quote
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
