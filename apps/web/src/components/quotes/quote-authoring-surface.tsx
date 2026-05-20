"use client";

/**
 * QuoteAuthoringSurface — the unified authoring UI for quote details and line items.
 *
 * Used inside QuoteWorkSurface when the quote is editable (DRAFT).
 * Replaces the fork between QuoteDraftWorkspaceControls (full page) and
 * QuoteLineItemsWorkspaceEditor (workspace-safe).
 *
 * All mutations use workspace-safe actions that return state instead of redirecting,
 * ensuring the UI stays open in drawers and popups.
 */

import { useEffect, useRef, useState, useActionState } from "react";
import Link from "next/link";
import { ArrowUpRight, ListOrdered, Sparkles, Loader2, X, ChevronDown } from "lucide-react";
import {
  addQuoteLineItemWorkspaceAction,
  deleteQuoteLineItemWorkspaceAction,
  updateQuoteLineItemWorkspaceAction,
  updateDraftQuoteDetailsWorkspaceAction,
  copyLeadToQuoteNotesWorkspaceAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import {
  generateQuoteLineExecutionAIProposalAction,
  applyQuoteLineExecutionAIProposalAction,
} from "@/app/(workspace)/quotes/quote-line-execution-actions";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import type { AILibraryProposal } from "@/lib/ai/library-proposal-schema";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import { getStagesForAiExecutionPlanning } from "@/lib/ai/ai-execution-plan-corrections";
import { AILibraryProposalReviewPanel } from "@/components/scope-library/ai-library-proposal-review-panel";
import { 
  QUOTE_FIELD_LIMITS,
  QUOTE_LINE_FIELD_LIMITS 
} from "@/app/(workspace)/quotes/quote-field-limits";
import {
  formatCentsAsDollarInput,
  formatMoneyCents,
  type QuoteLineItemPayload,
} from "@/lib/quote-display";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import { SavedLineItemPickerDialog } from "@/components/quotes/saved-line-item-picker-dialog";
import {
  CustomerProposalOptionalFields,
  LINE_PROPOSAL_NAMES,
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

import {
  QuoteLineDraftExecutionSummary,
} from "@/components/quotes/quote-line-item-display";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import type { QuoteWorkspaceLead } from "@/lib/quote-workspace-payload";
import { toast } from "sonner";

import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SignalCard } from "@/components/ui/signal-card";
import { EmptyState } from "@/components/ui/empty-state";
import { parseIntakeNotes } from "@/lib/lead-display";

const initialState: QuoteWorkspaceActionState = {};
const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

export function ArchivedQuoteReadOnlyNotice() {
  return (
    <WorkspacePanel padding="compact" className="mb-6 border-border-strong">
      <p className="text-sm font-medium text-foreground">Archived — internal view only</p>
      <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
        This is not a shared or portal quote page. Title, internal notes, and line items cannot be
        changed until you restore to draft. The only state change from here is restore; checkpoints
        and live proposal preview stay staff-only views on the quote record.
      </p>
    </WorkspacePanel>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-danger"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

/* ─── Quote Details Form ────────────────────────────────────────────────── */

function QuoteDraftDetailsForm({
  quoteId,
  initialTitle,
  initialCustomerDocumentTitle,
  onMutated,
}: {
  quoteId: string;
  initialTitle: string;
  initialCustomerDocumentTitle: string | null;
  onMutated: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    updateDraftQuoteDetailsWorkspaceAction.bind(null, quoteId),
    initialState,
  );

  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      toast.success("Quote details saved.");
      onMutated();
    }
  }, [state, onMutated]);

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Draft details"
        description="Staff workspace fields. Optional proposal document title shapes the customer-facing document."
      />
      <form action={formAction} className="space-y-4">
        {state.error ? <FormError message={state.error} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block">
              <span className={fieldLabelClass}>Quote workspace title</span>
              <input
                name="title"
                type="text"
                required
                maxLength={QUOTE_FIELD_LIMITS.title}
                defaultValue={initialTitle}
                className={controlClass}
                autoComplete="off"
              />
            </label>
          </div>
          <div>
            <label className="block">
              <span className={fieldLabelClass}>Proposal document title (customer-facing)</span>
              <input
                name="customerDocumentTitle"
                type="text"
                maxLength={QUOTE_FIELD_LIMITS.customerDocumentTitle}
                defaultValue={initialCustomerDocumentTitle ?? ""}
                placeholder="Defaults to workspace title"
                className={controlClass}
                autoComplete="off"
              />
            </label>
          </div>
        </div>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save quote details"}
        </button>
      </form>
    </div>
  );
}

function QuoteInternalNotesSidebarForm({
  quoteId,
  initialTitle,
  initialInternalNotes,
  onMutated,
}: {
  quoteId: string;
  initialTitle: string;
  initialInternalNotes: string | null;
  onMutated: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    updateDraftQuoteDetailsWorkspaceAction.bind(null, quoteId),
    initialState,
  );

  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      toast.success("Internal notes saved.");
      onMutated();
    }
  }, [state, onMutated]);

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
          Internal Quote Notes
        </h3>
      </div>
      <form action={formAction} className="space-y-3">
        {/* Hidden field to preserve current title */}
        <input type="hidden" name="title" defaultValue={initialTitle} />
        
        <textarea
          name="internalNotes"
          rows={6}
          maxLength={QUOTE_FIELD_LIMITS.internalNotes}
          defaultValue={initialInternalNotes ?? ""}
          placeholder="Add internal context for the team... (staff-only)"
          className={`${controlClass} text-xs`}
        />
        <button type="submit" className={`${secondaryButtonClass} w-full justify-center`} disabled={isPending}>
          {isPending ? "Saving…" : "Save Notes"}
        </button>
      </form>
    </section>
  );
}

function IntakeReferencePopover({ notes }: { notes: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const { isPublicIntake, parsedFields, cleanNotes } = parseIntakeNotes(notes);

  if (!notes) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="text-[9px] font-bold uppercase tracking-wider text-accent hover:text-accent/80 underline decoration-accent/30 underline-offset-2 transition-colors ml-2"
      >
        View Intake
      </button>
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 top-6 z-50 w-72 rounded-xl border border-border bg-surface p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="size-3 text-accent" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">Intake Context</span>
              </div>
              <button onClick={() => setIsOpen(false)}>
                <X className="size-3 text-foreground-subtle hover:text-foreground" />
              </button>
            </div>
            
            {isPublicIntake ? (
              <div className="space-y-3">
                {parsedFields.map((field) => (
                  <div key={field.label} className="space-y-0.5">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-foreground-subtle">
                      {field.label}
                    </p>
                    <p className="text-xs text-foreground leading-tight">
                      {field.value}
                    </p>
                  </div>
                ))}
                <div className="border-t border-border pt-2">
                  <p className="text-[8px] font-bold uppercase tracking-wider text-foreground-subtle mb-1">Raw Notes</p>
                  <p className="text-[10px] italic text-foreground-muted leading-relaxed">
                    &ldquo;{cleanNotes}&rdquo;
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs italic text-foreground-muted leading-relaxed">
                &ldquo;{notes}&rdquo;
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Line Item Forms ───────────────────────────────────────────────────── */

function AddLineItemForm({
  quoteId,
  autoFocus,
  onSuccess,
  onCancel,
  leadNotes,
}: {
  quoteId: string;
  autoFocus: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  leadNotes: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    addQuoteLineItemWorkspaceAction.bind(null, quoteId),
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (autoFocus) {
      descriptionRef.current?.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      formRef.current?.reset();
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-3 @lg:p-4"
    >
      <div className="flex items-center justify-between">
        <p className={sectionLabelClass}>Add line item</p>
        <button
          type="button"
          className="text-[0.65rem] font-medium text-foreground-subtle hover:text-foreground"
          onClick={onCancel}
          disabled={isPending}
        >
          Close
        </button>
      </div>
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Staff scope (internal description)</span>
          <input
            ref={descriptionRef}
            name="description"
            type="text"
            required
            maxLength={QUOTE_LINE_FIELD_LIMITS.description}
            className={controlClass}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabelClass}>Quantity</span>
          <input
            name="quantity"
            type="text"
            required
            inputMode="decimal"
            placeholder="e.g. 4 or 2.5"
            className={controlClass}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Unit price (USD)</span>
          <input
            name="unitAmountDollars"
            type="text"
            required
            inputMode="decimal"
            placeholder="e.g. 150 or 150.50"
            className={controlClass}
            autoComplete="off"
          />
        </label>
      </div>
      <div>
        <label className="block">
          <div className="flex items-center justify-between">
            <span className={fieldLabelClass}>Line-specific execution notes (optional)</span>
            <IntakeReferencePopover notes={leadNotes} />
          </div>
          <textarea
            name="internalNotes"
            rows={2}
            maxLength={QUOTE_LINE_FIELD_LIMITS.internalNotes}
            className={controlClass}
          />
        </label>
      </div>
      <CustomerProposalOptionalFields names={LINE_PROPOSAL_NAMES} variant="line" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Adding…" : "Add line item"}
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditLineItemForm({
  quoteId,
  line,
  onSuccess,
  onCancel,
  leadNotes,
}: {
  quoteId: string;
  line: QuoteLineItemPayload;
  onSuccess: () => void;
  onCancel: () => void;
  leadNotes: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    updateQuoteLineItemWorkspaceAction.bind(null, quoteId, line.id),
    initialState,
  );
  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <form
      action={formAction}
      className="mt-3 space-y-3 border-t border-border pt-2 @lg:pt-3"
    >
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Staff scope (internal description)</span>
          <input
            name="description"
            type="text"
            required
            maxLength={QUOTE_LINE_FIELD_LIMITS.description}
            defaultValue={line.description}
            className={controlClass}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabelClass}>Quantity</span>
          <input
            name="quantity"
            type="text"
            required
            inputMode="decimal"
            defaultValue={line.quantityDisplay}
            className={controlClass}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Unit price (USD)</span>
          <input
            name="unitAmountDollars"
            type="text"
            required
            inputMode="decimal"
            defaultValue={formatCentsAsDollarInput(line.unitAmountCents)}
            className={controlClass}
            autoComplete="off"
          />
        </label>
      </div>
      <div>
        <label className="block">
          <div className="flex items-center justify-between">
            <span className={fieldLabelClass}>Line-specific execution notes (optional)</span>
            <IntakeReferencePopover notes={leadNotes} />
          </div>
          <textarea
            name="internalNotes"
            rows={2}
            maxLength={QUOTE_LINE_FIELD_LIMITS.internalNotes}
            defaultValue={line.internalNotes ?? ""}
            className={controlClass}
          />
        </label>
      </div>
      <CustomerProposalOptionalFields
        names={LINE_PROPOSAL_NAMES}
        variant="line"
        defaults={{
          scopeTitle: line.customerScopeTitle,
          scopeDescription: line.customerScopeDescription,
          includedNotes: line.customerIncludedNotes,
          excludedNotes: line.customerExcludedNotes,
          presentationGroup: line.customerPresentationGroup,
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save line"}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteLineItemForm({
  quoteId,
  lineId,
  onSuccess,
}: {
  quoteId: string;
  lineId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteQuoteLineItemWorkspaceAction.bind(null, quoteId, lineId),
    initialState,
  );
  const handledKeyRef = useRef<unknown>(null);

  useEffect(() => {
    if (state.success && handledKeyRef.current !== state) {
      handledKeyRef.current = state;
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="inline">
      {state.error ? (
        <p className="mb-2 text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={dangerButtonClass} disabled={isPending}>
        {isPending ? "Removing…" : "Delete"}
      </button>
    </form>
  );
}

/* ─── Main Export ───────────────────────────────────────────────────────── */

export type QuoteAuthoringSurfaceProps = {
  quoteId: string;
  quoteHref: string;
  initialTitle: string;
  initialInternalNotes: string | null;
  initialCustomerDocumentTitle: string | null;
  lead: QuoteWorkspaceLead | null;
  lineItems: readonly QuoteLineItemPayload[];
  subtotalCents: number;
  totalCents: number;
  /** Scope Library templates available to apply inline. */
  lineItemTemplates: readonly LineItemTemplatePickerRow[];
  /** Draft execution tasks grouped by line id. */
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  /** Reusable task options for copying into line execution. */
  reusableTaskOptions: ReusableTaskPickerOption[];
  /** Available stages for inline draft-execution editing. */
  stages: { id: string; name: string }[];
  /**
   * When true, the editor mounts with the add-line form open and focuses
   * the first field. The editor calls `onAddOpenConsumed` once it has
   * applied the request so the parent can clear its trigger flag.
   */
  shouldFocusAddForm?: boolean;
  onAddOpenConsumed?: () => void;
  /** Opens the Scope Library picker dialog once (from Overview next step). */
  shouldOpenScopeLibraryPicker?: boolean;
  onScopeLibraryPickerOpenConsumed?: () => void;
  /**
   * Called after a successful add / update / delete / template-apply so
   * the container can re-fetch its `QuoteWorkSurfaceData` payload.
   */
  onMutated: () => void;
};

export function QuoteAuthoringSurface({
  quoteId,
  quoteHref,
  initialTitle,
  initialInternalNotes,
  initialCustomerDocumentTitle,
  lead,
  lineItems,
  subtotalCents,
  totalCents,
  lineItemTemplates,
  draftTasksByLineId,
  reusableTaskOptions,
  stages,
  shouldFocusAddForm = false,
  onAddOpenConsumed,
  shouldOpenScopeLibraryPicker = false,
  onScopeLibraryPickerOpenConsumed,
  onMutated,
}: QuoteAuthoringSurfaceProps) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [autoFocusAdd, setAutoFocusAdd] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [aiProposal, setAiProposal] = useState<AILibraryProposal | null>(null);
  const [aiProposalLineId, setAiProposalLineId] = useState<string | null>(null);
  const [aiProposalGeneration, setAiProposalGeneration] =
    useState<AILibraryProposalGenerationMeta | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showRawIntake, setShowRawIntake] = useState(false);

  const { isPublicIntake, parsedFields, cleanNotes } = parseIntakeNotes(lead?.notes ?? null);

  const handleGeneratePlan = async (lineId: string) => {
    if (aiProposal && aiProposalLineId === lineId) {
      return;
    }
    if (aiProposal) {
      closeAiProposal();
    }
    setIsGenerating(lineId);
    try {
      const result = await generateQuoteLineExecutionAIProposalAction(quoteId, lineId);
      if (result.error) {
        toast.error(result.error);
        closeAiProposal();
      } else if (result.proposal) {
        setAiProposal(result.proposal);
        setAiProposalLineId(lineId);
        setAiProposalGeneration(result.generation ?? null);
        toast.success("Review the AI execution plan in the panel on the right.");
      } else {
        toast.error("AI returned no execution plan. Try again.");
        closeAiProposal();
      }
    } catch (e) {
      console.error(e);
      toast.error(getAiActionErrorMessage(e, "Failed to generate AI proposal."));
      closeAiProposal();
    } finally {
      setIsGenerating(null);
    }
  };

  const handleApplyAiProposal = async (approvedProposal: AILibraryProposal) => {
    if (!aiProposalLineId) {
      return;
    }
    const result = await applyQuoteLineExecutionAIProposalAction(
      quoteId,
      aiProposalLineId,
      approvedProposal,
      aiProposalGeneration ?? undefined,
    );
    if (result.error) {
      throw new Error(result.error);
    }
    if (result.warnings?.length) {
      result.warnings.forEach((w) => toast.warning(w));
    }
    onMutated();
  };

  const closeAiProposal = () => {
    setAiProposal(null);
    setAiProposalLineId(null);
    setAiProposalGeneration(null);
  };

  useEffect(() => {
    if (!shouldFocusAddForm) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setIsAddOpen(true);
      setAutoFocusAdd(true);
      onAddOpenConsumed?.();
    });
    return () => {
      cancelled = true;
    };
  }, [shouldFocusAddForm, onAddOpenConsumed]);

  const handleAddSuccess = () => {
    setIsAddOpen(false);
    setAutoFocusAdd(false);
    onMutated();
  };

  const handleEditSuccess = () => {
    setEditingLineId(null);
    onMutated();
  };

  const lineCount = lineItems.length;

  return (
    <div className="@container">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-6">
          <WorkspacePanel padding="none" className="border-none bg-transparent shadow-none ring-0">
            <QuoteDraftDetailsForm
              quoteId={quoteId}
              initialTitle={initialTitle}
              initialCustomerDocumentTitle={initialCustomerDocumentTitle}
              onMutated={onMutated}
            />
          </WorkspacePanel>

          <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
            <SectionHeading
              title="Line items"
              description="Each row is commercial scope and pricing first. Internal draft execution and planning stay under each line."
              actions={
                !isAddOpen ? (
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => {
                      setIsAddOpen(true);
                      setAutoFocusAdd(true);
                    }}
                  >
                    Add line item
                  </button>
                ) : null
              }
            />

            <div className="mb-5 grid gap-3 grid-cols-2 @lg:grid-cols-3">
              <SignalCard
                label="Subtotal"
                value={formatMoneyCents(subtotalCents)}
                hint="Sum of line totals."
              />
              <SignalCard
                label="Total"
                value={formatMoneyCents(totalCents)}
                hint="Same as subtotal for now."
              />
              <SignalCard
                label="Lines"
                value={String(lineCount)}
                hint="Persisted rows."
              />
            </div>

            {isAddOpen && (
              <div className="mb-6">
                <AddLineItemForm
                  quoteId={quoteId}
                  autoFocus={autoFocusAdd}
                  onSuccess={handleAddSuccess}
                  onCancel={() => {
                    setIsAddOpen(false);
                    setAutoFocusAdd(false);
                  }}
                  leadNotes={lead?.notes ?? null}
                />
              </div>
            )}

            {lineCount === 0 ? (
              <div className="mt-6">
                <EmptyState
                  icon={ListOrdered}
                  title="No line items on this quote yet"
                  description="This draft quote has no line items. Add custom scope or copy reusable scope from the Scope Library."
                >
                  <div className="flex flex-wrap gap-2">
                    {!isAddOpen && (
                      <button
                        type="button"
                        className={primaryButtonClass}
                        onClick={() => {
                          setIsAddOpen(true);
                          setAutoFocusAdd(true);
                        }}
                      >
                        Add line item
                      </button>
                    )}
                    <SavedLineItemPickerDialog
                      quoteId={quoteId}
                      templates={[...lineItemTemplates]}
                      onApplied={onMutated}
                      closeOnApply={false}
                      triggerVariant="compact"
                      requestOpen={shouldOpenScopeLibraryPicker}
                      onRequestOpenConsumed={onScopeLibraryPickerOpenConsumed}
                    />
                  </div>
                </EmptyState>
              </div>
            ) : (
              <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
                {lineItems.map((line) => {
                  const isEditing = editingLineId === line.id;
                  return (
                    <li key={line.id} className="px-3 py-3 @lg:px-4 @lg:py-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {line.description}
                          </p>
                          <p className="mt-0.5 text-[0.7rem] text-foreground-subtle tabular-nums">
                            {line.quantityDisplay} ×{" "}
                            {formatMoneyCents(line.unitAmountCents)} ·{" "}
                            <span className="font-medium text-foreground">
                              {formatMoneyCents(line.lineTotalCents)}
                            </span>
                          </p>
                          <QuoteLineDraftExecutionSummary
                            quoteId={quoteId}
                            line={line}
                            isExecutionEditable
                            draftTasks={draftTasksByLineId[line.id] ?? []}
                            reusableOptions={reusableTaskOptions}
                            stages={stages}
                          />
                        </div>
                        {!isEditing && (
                          <div className="flex shrink-0 flex-col items-end gap-2 @lg:flex-row @lg:items-center">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className={secondaryButtonClass}
                                onClick={() => setEditingLineId(line.id)}
                              >
                                Edit
                              </button>
                              <DeleteLineItemForm
                                quoteId={quoteId}
                                lineId={line.id}
                                onSuccess={onMutated}
                              />
                            </div>
                            <button
                              type="button"
                              disabled={isGenerating === line.id || aiProposal !== null}
                              onClick={() => handleGeneratePlan(line.id)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                            >
                              {isGenerating === line.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                              {isGenerating === line.id ? "Thinking…" : "AI Execution Plan"}
                            </button>
                          </div>
                        )}
                      </div>
                      {isEditing && (
                        <EditLineItemForm
                          quoteId={quoteId}
                          line={line}
                          onSuccess={handleEditSuccess}
                          onCancel={() => setEditingLineId(null)}
                          leadNotes={lead?.notes ?? null}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {lineCount > 0 && (
              <div className="mt-4">
                <SavedLineItemPickerDialog
                  quoteId={quoteId}
                  templates={[...lineItemTemplates]}
                  onApplied={onMutated}
                  closeOnApply={false}
                  triggerVariant="compact"
                  requestOpen={shouldOpenScopeLibraryPicker}
                  onRequestOpenConsumed={onScopeLibraryPickerOpenConsumed}
                />
              </div>
            )}
          </WorkspacePanel>

          <div className="mt-4 pt-1">
            <Link
              href={`${quoteHref}#line-items`}
              className="inline-flex items-center gap-1 text-[10px] text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Open full quote page for advanced editing
              <ArrowUpRight className="size-2.5" strokeWidth={1.5} />
            </Link>
          </div>
        </div>

        {/* Sidebar: Intake Reference & Internal Notes */}
        <div className={`w-full lg:w-80 shrink-0 transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "lg:w-10 opacity-50"}`}>
          <div className="sticky top-6 space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-foreground-subtle hover:text-foreground transition-colors"
              >
                {isSidebarOpen ? (
                  <>Hide Reference <X className="size-3" /></>
                ) : (
                  <><Sparkles className="size-3" /> Show Reference</>
                )}
              </button>
            </div>

            {isSidebarOpen && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Intake Reference Block */}
                <section className="rounded-xl border border-border bg-surface p-4 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-3.5 text-accent" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-foreground-subtle">
                      Intake Reference
                    </h3>
                  </div>

                  {isPublicIntake ? (
                    <div className="space-y-4">
                      {parsedFields.map((field) => {
                        const isHighSignal = field.label === "Service Location Address" || field.label === "Request Type";
                        return (
                          <div key={field.label} className="space-y-1">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-foreground-subtle">
                              {field.label}
                            </p>
                            <p className={`text-xs leading-tight ${isHighSignal ? "font-bold text-foreground" : "text-foreground-muted"}`}>
                              {field.value}
                            </p>
                          </div>
                        );
                      })}
                      
                      <div className="border-t border-border pt-2">
                        <button
                          onClick={() => setShowRawIntake(!showRawIntake)}
                          className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-foreground-subtle hover:text-foreground transition-colors"
                        >
                          <ChevronDown className={`size-2.5 transition-transform ${showRawIntake ? "rotate-180" : ""}`} />
                          {showRawIntake ? "Hide raw notes" : "View raw notes"}
                        </button>
                        {showRawIntake && (
                          <p className="mt-2 text-[10px] italic text-foreground-muted leading-relaxed">
                            &ldquo;{cleanNotes}&rdquo;
                          </p>
                        )}
                      </div>
                    </div>
                  ) : lead?.notes ? (
                    <p className="text-xs italic text-foreground-muted leading-relaxed">
                      &ldquo;{lead.notes}&rdquo;
                    </p>
                  ) : (
                    <p className="text-xs italic text-foreground-subtle">No intake notes available.</p>
                  )}
                </section>

                {/* Internal Quote Notes Block */}
                <QuoteInternalNotesSidebarForm
                  quoteId={quoteId}
                  initialTitle={initialTitle}
                  initialInternalNotes={initialInternalNotes}
                  onMutated={onMutated}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {aiProposal && (
        <AILibraryProposalReviewPanel
          proposal={aiProposal}
          generation={aiProposalGeneration ?? undefined}
          stages={getStagesForAiExecutionPlanning(stages)}
          onClose={closeAiProposal}
          onApply={handleApplyAiProposal}
        />
      )}
    </div>
  );
}
