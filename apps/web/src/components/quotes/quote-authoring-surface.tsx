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

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import Link from "next/link";
import { ArrowUpRight, ListOrdered, Sparkles, Loader2, X, ChevronDown } from "lucide-react";
import {
  addQuoteLineItemWorkspaceAction,
  deleteQuoteLineItemWorkspaceAction,
  updateQuoteLineItemWorkspaceAction,
  updateDraftQuoteDetailsWorkspaceAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import {
  generateQuoteLineExecutionAIProposalAction,
  assessQuoteLineExecutionContextAction,
  applyQuoteLineExecutionAIProposalAction,
} from "@/app/(workspace)/quotes/quote-line-execution-actions";
import {
  generateQuoteScopeSuggestionsAction,
  applyQuoteScopeSuggestionsAction,
} from "@/app/(workspace)/quotes/quote-line-items-ai-actions";
import {
  getClarificationLineModelAction,
  getClarificationSetByKeyAction,
  searchActiveClarificationQuestionSetsAction,
  suggestLineClarificationAnswersAction,
  applyLineClarificationAnswersAction,
  createClarificationQuestionSetForLineAction,
  generateClarificationQuestionSetForLineAction,
  checkClarificationSetKeyAction,
  updateClarificationQuestionSetForLineAction,
} from "@/app/(workspace)/quotes/quote-line-clarification-actions";
import type {
  ClarificationQuestionSetPickerRow,
  ClarificationLineModel,
  ClarificationSetOption,
} from "@/app/(workspace)/quotes/quote-line-clarification-types";
import type {
  ClarificationAnswerGenerationMeta,
  ClarificationAnswerProposal,
} from "@/lib/ai/clarification-answer-proposal-schema";
import type { ClarificationQuestionSetProposal } from "@/lib/ai/clarification-question-set-proposal-schema";
import type { LineClarificationAnswers } from "@/lib/clarification/clarification-types";
import {
  ClarifyScopePanel,
  type ClarificationSetDraftPayload,
} from "@/components/quotes/quote-line-clarify-scope-panel";
import { getAiActionErrorMessage } from "@/lib/ai/ai-provider-errors";
import type {
  CommercialLineItemSuggestion,
  QuoteScopeSuggestionsProposal,
  QuoteScopeSuggestionsGenerationMeta,
} from "@/lib/ai/quote-line-items-proposal-schema";
import type { ExecutionContextAssessment } from "@/app/(workspace)/quotes/quote-line-execution-types";
import type {
  ExecutionPlanningContextBucket,
  ExecutionPlanningContextManifest,
  ExecutionPlanningContextSourceFlags,
} from "@/app/(workspace)/quotes/quote-line-execution-types";
import type { QuoteScopeCaptureSourceFlags } from "@/lib/ai/quote-scope-capture-context";
import type { AILibraryProposal } from "@/lib/ai/library-proposal-schema";
import type { AILibraryProposalGenerationMeta } from "@/lib/ai/ai-execution-plan-generation";
import { getStagesForAiExecutionPlanning } from "@/lib/ai/ai-execution-plan-corrections";
import { AILibraryProposalReviewPanel } from "@/components/scope-library/ai-library-proposal-review-panel";
import { QuoteScopeCapturePanel } from "@/components/quotes/quote-line-items-ai-review-panel";
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
import { buildQuoteExecutionPlanningContextManifest } from "@/lib/ai/quote-execution-planning-context";
import { deriveNeedsForQuoteLines } from "@/lib/derived-needs/derive-needs";
import type { DerivedNeed } from "@/lib/derived-needs/types";

const initialState: QuoteWorkspaceActionState = {};
const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;
const aiExecutionContextPreflightEnabled =
  process.env.NEXT_PUBLIC_AI_EXECUTION_CONTEXT_PREFLIGHT === "1";

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

type AiRegenerateArgs = {
  planningContext: string;
};

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

function DerivedNeedsPreview({ needs }: { needs: readonly DerivedNeed[] }) {
  if (needs.length === 0) return null;

  const grouped = needs.reduce<Record<string, DerivedNeed[]>>((acc, need) => {
    const key = need.sourceQuoteLineItemId;
    acc[key] = acc[key] ? [...acc[key], need] : [need];
    return acc;
  }, {});

  return (
    <div className="mb-6 rounded-lg border border-border bg-foreground/[0.02] p-3">
      <div className="mb-2">
        <p className={sectionLabelClass}>Derived needs preview</p>
        <p className="mt-1 text-xs text-foreground-subtle">
          Enter once, derive everywhere: quantities are generated from saved scope facts and
          should not be re-entered manually.
        </p>
      </div>
      <div className="space-y-3">
        {Object.entries(grouped).map(([lineId, lineNeeds]) => (
          <div key={lineId} className="rounded-md border border-border bg-surface px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">
              Line {lineId.slice(-6)}
            </p>
            <ul className="mt-1 space-y-1">
              {lineNeeds.map((need, index) => (
                <li key={`${need.name}-${index}`} className="text-xs text-foreground-muted">
                  <span className="font-medium text-foreground">{need.name}</span>: {need.quantity}{" "}
                  {need.unit}
                  <span className="ml-1 uppercase text-foreground-subtle">
                    ({need.confidence.replace("_", " ")})
                  </span>
                  {need.orderNote ? (
                    <span className="ml-1 text-foreground-subtle">- {need.orderNote}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
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
        description="Internal title and the name your customer sees on the proposal."
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
  const [activeAiLineId, setActiveAiLineId] = useState<string | null>(null);
  const [aiProposalGeneration, setAiProposalGeneration] =
    useState<AILibraryProposalGenerationMeta | null>(null);
  const [aiRegenerating, setAiRegenerating] = useState(false);
  const [aiContextAssessment, setAiContextAssessment] =
    useState<ExecutionContextAssessment | null>(null);
  const [aiContextManifest, setAiContextManifest] =
    useState<ExecutionPlanningContextManifest | null>(null);
  const [aiContextPreview, setAiContextPreview] = useState("");
  const [aiContextSourceFlags, setAiContextSourceFlags] = useState<ExecutionPlanningContextSourceFlags>({
    includeReusableExecutionGuidance: true,
    includeJobTechnicalDetails: false,
    includeSiteAccessSchedule: false,
    includeCustomerProposal: false,
    includeBackground: false,
    includePriorMissingContext: true,
    includeSiteDetailsFacts: true,
  });
  const [aiContextItemOverrides, setAiContextItemOverrides] = useState<
    Record<string, { include?: boolean; bucket?: ExecutionPlanningContextBucket }>
  >({});
  const [aiKeepTaskIds, setAiKeepTaskIds] = useState<string[]>([]);
  const [isAiAssessing, setIsAiAssessing] = useState(false);
  const aiAssessRequestSeqRef = useRef(0);
  const [planningContextByLineId, setPlanningContextByLineId] = useState<Record<string, string>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showRawIntake, setShowRawIntake] = useState(false);
  const [scopeCaptureOpen, setScopeCaptureOpen] = useState(false);
  const [scopeCaptureText, setScopeCaptureText] = useState("");
  const [scopeAdditionalInstructions, setScopeAdditionalInstructions] = useState("");
  const [scopeCaptureSources, setScopeCaptureSources] = useState<QuoteScopeCaptureSourceFlags>({
    includeIntakeNotes: true,
    includeInternalQuoteNotes: true,
    includeScopeSummary: true,
  });
  const [scopeProposal, setScopeProposal] = useState<QuoteScopeSuggestionsProposal | null>(null);
  const [scopeGeneration, setScopeGeneration] =
    useState<QuoteScopeSuggestionsGenerationMeta | null>(null);
  const [isScopeGenerating, setIsScopeGenerating] = useState(false);
  const [isScopeApplying, setIsScopeApplying] = useState(false);

  // Scope clarification (per-line)
  const [clarifyLineId, setClarifyLineId] = useState<string | null>(null);
  const [clarifyModel, setClarifyModel] = useState<ClarificationLineModel | null>(null);
  const [clarifyAlternatives, setClarifyAlternatives] = useState<ClarificationSetOption[]>([]);
  const [clarifySetOptions, setClarifySetOptions] = useState<ClarificationQuestionSetPickerRow[]>([]);
  const [clarifySetOptionsQuery, setClarifySetOptionsQuery] = useState("");
  const [clarifyAutoMatchedSetKey, setClarifyAutoMatchedSetKey] = useState<string | null>(null);
  const [isClarifySetSearchLoading, setIsClarifySetSearchLoading] = useState(false);
  const [isClarifyLoading, setIsClarifyLoading] = useState(false);
  const [clarifyAiProposal, setClarifyAiProposal] = useState<ClarificationAnswerProposal | null>(
    null,
  );
  const [clarifyAiGeneration, setClarifyAiGeneration] =
    useState<ClarificationAnswerGenerationMeta | null>(null);
  const [isClarifySuggesting, setIsClarifySuggesting] = useState(false);
  const [isClarifyApplying, setIsClarifyApplying] = useState(false);
  const [isClarifySetGenerating, setIsClarifySetGenerating] = useState(false);
  const [isClarifySetCreating, setIsClarifySetCreating] = useState(false);
  const [isClarifySetUpdating, setIsClarifySetUpdating] = useState(false);

  const hasIntakeNotes = Boolean(lead?.notes?.trim());
  const hasScopeSummary = Boolean(lead?.scopeSummary?.trim());
  const hasInternalNotesForCapture = Boolean(initialInternalNotes?.trim());

  const { isPublicIntake, parsedFields, cleanNotes } = parseIntakeNotes(lead?.notes ?? null);

  const ensurePlanningContextSeed = (lineId: string): string => {
    const existing = planningContextByLineId[lineId];
    if (typeof existing === "string") {
      return existing;
    }
    const line = lineItems.find((item) => item.id === lineId);
    const manifest = buildQuoteExecutionPlanningContextManifest({
      userInstructions: "",
      lineInternalNotes: line?.internalNotes ?? null,
      customerScopeTitle: null,
      customerScopeDescription: null,
      customerIncludedNotes: null,
      customerExcludedNotes: null,
      quoteInternalNotes: null,
      leadNotes: null,
      priorMissingContext: [],
    });
    const seed = manifest.items
      .filter((item) => item.bucket === "reusable_execution_guidance")
      .map((item) => item.content.trim())
      .filter(Boolean)
      .join("\n")
      .trim();
    setPlanningContextByLineId((prev) => ({ ...prev, [lineId]: seed }));
    return seed;
  };

  const setPlanningContextForLine = (lineId: string, value: string) => {
    setPlanningContextByLineId((prev) => ({ ...prev, [lineId]: value }));
  };

  const openAiPanelForLine = (lineId: string) => {
    ensurePlanningContextSeed(lineId);
    if (activeAiLineId && activeAiLineId !== lineId) {
      closeAiPanel();
    }
    setAiContextItemOverrides({});
    setAiKeepTaskIds([]);
    setActiveAiLineId(lineId);
  };

  const handleGeneratePlan = async (lineId: string, options?: AiRegenerateArgs) => {
    const planningContext = options?.planningContext ?? ensurePlanningContextSeed(lineId);
    setActiveAiLineId(lineId);
    setIsGenerating(lineId);
    try {
      const result = await generateQuoteLineExecutionAIProposalAction(quoteId, lineId, {
        userInstructions: planningContext,
        priorMissingContext: aiProposal?.missingContext,
        sourceFlags: aiContextSourceFlags,
        itemOverrides: aiContextItemOverrides,
      });
      if (result.error) {
        toast.error(result.error);
        setAiProposal(null);
        setAiProposalGeneration(null);
      } else if (result.proposal) {
        setAiProposal(result.proposal);
        setAiProposalGeneration(result.generation ?? null);
        setAiContextManifest(result.contextManifest ?? null);
        setAiContextPreview(result.contextPreview ?? "");
      } else {
        toast.error("AI returned no execution plan. Try again.");
        setAiProposal(null);
        setAiProposalGeneration(null);
      }
    } catch (e) {
      console.error(e);
      toast.error(getAiActionErrorMessage(e, "Failed to generate AI proposal."));
      setAiProposal(null);
      setAiProposalGeneration(null);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleApplyAiProposal = async (
    approvedProposal: AILibraryProposal,
    options?: { applyMode?: "append" | "replace"; keepTaskIds?: string[] },
  ) => {
    if (!activeAiLineId) {
      return;
    }
    const result = await applyQuoteLineExecutionAIProposalAction(
      quoteId,
      activeAiLineId,
      approvedProposal,
      aiProposalGeneration ?? undefined,
      {
        mode: options?.applyMode ?? "replace",
        keepTaskIds: options?.keepTaskIds ?? aiKeepTaskIds,
      },
    );
    if (result.error) {
      throw new Error(result.error);
    }
    if (result.warnings?.length) {
      result.warnings.forEach((w) => toast.warning(w));
    }
    onMutated();
  };

  const closeAiPanel = () => {
    setActiveAiLineId(null);
    setAiProposal(null);
    setAiProposalGeneration(null);
    setAiContextAssessment(null);
    setAiContextManifest(null);
    setAiContextPreview("");
    setAiContextItemOverrides({});
    setAiKeepTaskIds([]);
    setIsAiAssessing(false);
    aiAssessRequestSeqRef.current += 1;
  };

  const handleAssessExecutionContext = async (lineId: string, planningContext: string) => {
    const seq = aiAssessRequestSeqRef.current + 1;
    aiAssessRequestSeqRef.current = seq;
    setIsAiAssessing(true);
    try {
      const result = await assessQuoteLineExecutionContextAction(quoteId, lineId, {
        userInstructions: planningContext,
        priorMissingContext: aiProposal?.missingContext,
        sourceFlags: aiContextSourceFlags,
        itemOverrides: aiContextItemOverrides,
      });
      if (aiAssessRequestSeqRef.current !== seq) {
        return;
      }
      if (result.error) {
        toast.warning(result.error);
        return;
      }
      setAiContextAssessment(result.assessment ?? null);
      setAiContextManifest(result.contextManifest ?? null);
      setAiContextPreview(result.contextPreview ?? "");
    } catch (error) {
      if (aiAssessRequestSeqRef.current !== seq) {
        return;
      }
      console.error(error);
      toast.warning(getAiActionErrorMessage(error, "Failed to assess execution context."));
    } finally {
      if (aiAssessRequestSeqRef.current === seq) {
        setIsAiAssessing(false);
      }
    }
  };

  const openScopeCapture = () => {
    setScopeCaptureOpen(true);
    setScopeProposal(null);
    setScopeGeneration(null);
  };

  const closeScopeCapture = () => {
    setScopeCaptureOpen(false);
    setScopeProposal(null);
    setScopeGeneration(null);
    setIsScopeGenerating(false);
    setIsScopeApplying(false);
  };

  const handleGenerateScopeSuggestions = async () => {
    setIsScopeGenerating(true);
    try {
      const result = await generateQuoteScopeSuggestionsAction(quoteId, {
        captureText: scopeCaptureText,
        additionalInstructions: scopeAdditionalInstructions,
        sources: scopeCaptureSources,
        priorMissingInfo: scopeProposal
          ? [
              ...scopeProposal.quoteMissingInfo,
              ...scopeProposal.commercialLineItems.flatMap((item) => item.missingInfo),
            ]
          : undefined,
      });
      if (result.error) {
        toast.error(result.error);
        setScopeProposal(null);
        setScopeGeneration(null);
        return;
      }
      if (!result.proposal) {
        toast.error("No scope suggestions returned. Try again.");
        setScopeProposal(null);
        setScopeGeneration(null);
        return;
      }
      setScopeProposal(result.proposal);
      setScopeGeneration(result.generation ?? null);
    } catch (e) {
      console.error(e);
      toast.error(getAiActionErrorMessage(e, "Failed to draft scope suggestions."));
      setScopeProposal(null);
      setScopeGeneration(null);
    } finally {
      setIsScopeGenerating(false);
    }
  };

  const handleApplyScopeSuggestions = async (approved: {
    selectedTemplateIds: string[];
    selectedCommercialLineItems: CommercialLineItemSuggestion[];
    selectedOptionalAddOnIds: string[];
    selectedQuoteJobContext: string[];
  }) => {
    if (!scopeProposal) return;
    setIsScopeApplying(true);
    try {
      const result = await applyQuoteScopeSuggestionsAction(quoteId, scopeProposal, {
        approved: {
          selectedTemplateIds: approved.selectedTemplateIds,
          selectedCommercialLineItems: approved.selectedCommercialLineItems.map((item) => ({
            tempId: item.tempId,
            description: item.description,
            customerScopeTitle: item.customerScopeTitle,
            customerScopeDescription: item.customerScopeDescription,
            lineItemDetails: item.lineItemDetails,
            executionPlanningNotes: item.executionPlanningNotes,
            missingInfo: item.missingInfo,
          })),
          selectedOptionalAddOnIds: approved.selectedOptionalAddOnIds,
          selectedQuoteJobContext: approved.selectedQuoteJobContext,
        },
        generation: scopeGeneration ?? undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.warnings?.length) {
        result.warnings.forEach((warning) => toast.warning(warning));
      }
      toast.success(
        result.createdCount === 1
          ? "1 line item added. Set pricing when ready."
          : `${result.createdCount} line items added. Set pricing when ready.`,
      );
      await Promise.resolve(onMutated());
      closeScopeCapture();
    } catch (e) {
      console.error(e);
      toast.error(getAiActionErrorMessage(e, "Failed to add scope suggestions."));
    } finally {
      setIsScopeApplying(false);
    }
  };

  const handleSearchClarificationSets = async (lineId: string, query?: string) => {
    setIsClarifySetSearchLoading(true);
    try {
      const result = await searchActiveClarificationQuestionSetsAction(quoteId, lineId, query);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setClarifySetOptions(result.sets ?? []);
      setClarifySetOptionsQuery(query?.trim() ?? "");
    } catch (error) {
      console.error(error);
      toast.error("Failed to load clarification question sets.");
    } finally {
      setIsClarifySetSearchLoading(false);
    }
  };

  const openClarifyScope = async (lineId: string) => {
    setClarifyLineId(lineId);
    setClarifyModel(null);
    setClarifyAlternatives([]);
    setClarifySetOptions([]);
    setClarifySetOptionsQuery("");
    setClarifyAutoMatchedSetKey(null);
    setClarifyAiProposal(null);
    setClarifyAiGeneration(null);
    setIsClarifyLoading(true);
    try {
      const result = await getClarificationLineModelAction(quoteId, lineId);
      if (result.error) {
        toast.error(result.error);
        setClarifyLineId(null);
        return;
      }
      if (result.model) {
        setClarifyModel(result.model);
        setClarifyAlternatives(result.model.alternatives);
        setClarifyAutoMatchedSetKey(result.model.matchedSet?.key ?? null);
      }
      await handleSearchClarificationSets(lineId);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load scope clarification.");
      setClarifyLineId(null);
    } finally {
      setIsClarifyLoading(false);
    }
  };

  const closeClarifyScope = () => {
    setClarifyLineId(null);
    setClarifyModel(null);
    setClarifyAlternatives([]);
    setClarifySetOptions([]);
    setClarifySetOptionsQuery("");
    setClarifyAutoMatchedSetKey(null);
    setClarifyAiProposal(null);
    setClarifyAiGeneration(null);
    setIsClarifySuggesting(false);
    setIsClarifyApplying(false);
    setIsClarifySetGenerating(false);
    setIsClarifySetCreating(false);
    setIsClarifySetUpdating(false);
  };

  const handleSelectClarifyAlternative = async (setKey: string) => {
    if (!clarifyLineId) return;
    setIsClarifyLoading(true);
    setClarifyAiProposal(null);
    setClarifyAiGeneration(null);
    try {
      const result = await getClarificationSetByKeyAction(quoteId, clarifyLineId, setKey);
      if (result.error || !result.model) {
        toast.error(result.error ?? "Failed to load that question set.");
        return;
      }
      setClarifyModel((prev) =>
        prev
          ? { ...prev, matchedSet: result.model!.matchedSet, savedAnswers: result.model!.savedAnswers }
          : result.model!,
      );
    } catch (e) {
      console.error(e);
      toast.error("Failed to load that question set.");
    } finally {
      setIsClarifyLoading(false);
    }
  };

  const handleSuggestClarifyAnswers = async () => {
    if (!clarifyLineId || !clarifyModel?.matchedSet) return;
    setIsClarifySuggesting(true);
    try {
      const result = await suggestLineClarificationAnswersAction(
        quoteId,
        clarifyLineId,
        clarifyModel.matchedSet.key,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setClarifyAiProposal(result.proposal ?? null);
      setClarifyAiGeneration(result.generation ?? null);
    } catch (e) {
      console.error(e);
      toast.error(getAiActionErrorMessage(e, "Failed to suggest clarification answers."));
    } finally {
      setIsClarifySuggesting(false);
    }
  };

  const handleApplyClarifyAnswers = async (answers: LineClarificationAnswers) => {
    if (!clarifyLineId) return;
    setIsClarifyApplying(true);
    try {
      const result = await applyLineClarificationAnswersAction(quoteId, clarifyLineId, answers);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Scope clarification applied to this line.");
      await Promise.resolve(onMutated());
      closeClarifyScope();
    } catch (e) {
      console.error(e);
      toast.error("Failed to apply scope clarification.");
    } finally {
      setIsClarifyApplying(false);
    }
  };

  const handleGenerateClarifySetProposal = async (): Promise<ClarificationQuestionSetProposal | null> => {
    if (!clarifyLineId) return null;
    setIsClarifySetGenerating(true);
    try {
      const result = await generateClarificationQuestionSetForLineAction(quoteId, clarifyLineId);
      if (result.error || !result.proposal) {
        toast.error(result.error ?? "Failed to generate clarification questions.");
        return null;
      }
      return result.proposal;
    } catch (error) {
      console.error(error);
      toast.error(getAiActionErrorMessage(error, "Failed to generate clarification questions."));
      return null;
    } finally {
      setIsClarifySetGenerating(false);
    }
  };

  const handleCreateClarifySet = async (payload: ClarificationSetDraftPayload): Promise<boolean> => {
    if (!clarifyLineId) return false;
    setIsClarifySetCreating(true);
    try {
      const result = await createClarificationQuestionSetForLineAction(
        quoteId,
        clarifyLineId,
        payload,
      );
      if (result.error || !result.matchedSet) {
        toast.error(result.error ?? "Failed to create question set.");
        return false;
      }
      const matchedSet = result.matchedSet;
      setClarifyModel((prev) =>
        prev
          ? { ...prev, matchedSet, alternatives: [], savedAnswers: null }
          : {
              lineId: clarifyLineId,
              lineDescription:
                lineItems.find((line) => line.id === clarifyLineId)?.description ?? "",
              matchedSet,
              alternatives: [],
              savedAnswers: null,
            },
      );
      setClarifyAlternatives([]);
      setClarifyAiProposal(null);
      setClarifyAiGeneration(null);
      setClarifySetOptionsQuery("");
      await handleSearchClarificationSets(clarifyLineId);
      toast.success("Clarification questions created. Fill answers and apply.");
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Failed to create clarification questions.");
      return false;
    } finally {
      setIsClarifySetCreating(false);
    }
  };

  const handleUpdateClarifySet = async (
    setKey: string,
    setVersion: number,
    payload: Pick<ClarificationSetDraftPayload, "questions">,
  ): Promise<boolean> => {
    if (!clarifyLineId) return false;
    setIsClarifySetUpdating(true);
    try {
      const result = await updateClarificationQuestionSetForLineAction(
        quoteId,
        clarifyLineId,
        setKey,
        setVersion,
        payload,
      );
      if (result.error || !result.matchedSet) {
        toast.error(result.error ?? "Failed to update questions.");
        return false;
      }
      setClarifyModel((prev) =>
        prev
          ? {
              ...prev,
              matchedSet: result.matchedSet!,
              savedAnswers: result.savedAnswers ?? prev.savedAnswers,
            }
          : prev,
      );
      toast.success("Questions updated.");
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Failed to update questions.");
      return false;
    } finally {
      setIsClarifySetUpdating(false);
    }
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
  const derivedNeeds = useMemo(
    () =>
      deriveNeedsForQuoteLines(
        lineItems.map((line) => ({
          lineId: line.id,
          clarifications: line.clarifications,
        })),
      ),
    [lineItems],
  );

  return (
    <div className="@container">
      <div className="flex flex-col gap-6 @5xl:flex-row @5xl:items-start">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-6">
          <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
            <QuoteDraftDetailsForm
              quoteId={quoteId}
              initialTitle={initialTitle}
              initialCustomerDocumentTitle={initialCustomerDocumentTitle}
              onMutated={onMutated}
            />

            <div className="my-6 border-t border-border" />

            <SectionHeading
              title="Line items"
              description="What you're quoting — scope, quantity, and price."
              actions={
                !isAddOpen && lineCount > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={openScopeCapture}
                    >
                      Quick scope capture
                    </button>
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
                  </div>
                ) : null
              }
            />

            <div className="mb-5 grid grid-cols-2 gap-3 @4xl:grid-cols-3">
              <SignalCard
                label="Subtotal"
                value={formatMoneyCents(subtotalCents)}
                hint="Before tax and fees"
              />
              <SignalCard
                label="Total"
                value={formatMoneyCents(totalCents)}
                hint="Before tax and fees"
              />
              <SignalCard
                label="Lines"
                value={String(lineCount)}
                hint="Items on this quote"
              />
            </div>

            <DerivedNeedsPreview needs={derivedNeeds} />

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
                  description="Add your first line item to start building this quote."
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
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={openScopeCapture}
                    >
                      Quick scope capture
                    </button>
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
                          <p className="line-clamp-2 text-sm font-medium text-foreground">
                            {line.description}
                          </p>
                          <p className="mt-0.5 text-[0.7rem] text-foreground-subtle tabular-nums">
                            {line.quantityDisplay} ×{" "}
                            {formatMoneyCents(line.unitAmountCents)} ·{" "}
                            <span className="font-medium text-foreground">
                              {formatMoneyCents(line.lineTotalCents)}
                            </span>
                          </p>
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
                              disabled={isClarifyLoading && clarifyLineId === line.id}
                              onClick={() => void openClarifyScope(line.id)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground-muted hover:text-foreground hover:border-border-strong transition-colors disabled:opacity-50"
                            >
                              {isClarifyLoading && clarifyLineId === line.id ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : null}
                              Clarify scope
                            </button>
                            <button
                              type="button"
                              disabled={isGenerating === line.id}
                              onClick={() => openAiPanelForLine(line.id)}
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
                      {!isEditing ? (
                        <QuoteLineDraftExecutionSummary
                          quoteId={quoteId}
                          line={line}
                          isExecutionEditable
                          draftTasks={draftTasksByLineId[line.id] ?? []}
                          reusableOptions={reusableTaskOptions}
                          stages={stages}
                        />
                      ) : null}
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
        <div
          className={[
            "w-full shrink-0 transition-all duration-300",
            isSidebarOpen ? "opacity-100 @5xl:w-72" : "opacity-50 @5xl:w-10",
          ].join(" ")}
        >
          <div className="sticky top-6 space-y-6">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground-subtle transition-colors hover:text-foreground"
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
                    <h3 className="text-xs font-bold uppercase tracking-widest text-foreground-subtle">
                      Intake Reference
                    </h3>
                  </div>

                  {isPublicIntake ? (
                    <div className="space-y-4">
                      {parsedFields.map((field) => {
                        const isHighSignal = field.label === "Service Location Address" || field.label === "Request Type";
                        return (
                          <div key={field.label} className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-foreground-subtle">
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
                          className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-foreground-subtle transition-colors hover:text-foreground"
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
                  {(hasIntakeNotes || hasScopeSummary || hasInternalNotesForCapture) && (
                    <button
                      type="button"
                      className="text-xs font-medium text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
                      onClick={openScopeCapture}
                    >
                      Draft scope from intake →
                    </button>
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

      {activeAiLineId ? (
        <AILibraryProposalReviewPanel
          proposal={aiProposal}
          generation={aiProposalGeneration ?? undefined}
          contextAssessment={aiExecutionContextPreflightEnabled ? aiContextAssessment : null}
          contextManifest={aiContextManifest}
          contextPreview={aiContextPreview}
          contextSourceFlags={aiContextSourceFlags}
          onContextSourceFlagsChange={setAiContextSourceFlags}
          contextItemOverrides={aiContextItemOverrides}
          onContextItemOverridesChange={setAiContextItemOverrides}
          stages={getStagesForAiExecutionPlanning(stages)}
          lineLabel={lineItems.find((item) => item.id === activeAiLineId)?.description}
          planningContext={planningContextByLineId[activeAiLineId] ?? ""}
          onPlanningContextChange={(value) => {
            setPlanningContextForLine(activeAiLineId, value);
          }}
          isGenerating={isGenerating === activeAiLineId}
          isAssessing={isAiAssessing}
          isRegenerating={aiRegenerating}
          onAssessContext={async ({ planningContext }) => {
            setPlanningContextForLine(activeAiLineId, planningContext);
            await handleAssessExecutionContext(activeAiLineId, planningContext);
          }}
          onGenerate={async ({ planningContext }) => {
            setPlanningContextForLine(activeAiLineId, planningContext);
            await handleGeneratePlan(activeAiLineId, { planningContext });
          }}
          onRegenerate={async ({ planningContext }) => {
            setAiRegenerating(true);
            try {
              setPlanningContextForLine(activeAiLineId, planningContext);
              await handleGeneratePlan(activeAiLineId, { planningContext });
            } finally {
              setAiRegenerating(false);
            }
          }}
          applyMode="replace"
          existingDraftTasks={(draftTasksByLineId[activeAiLineId] ?? []).map((task) => ({
            id: task.id,
            title: task.title,
          }))}
          selectedKeepTaskIds={aiKeepTaskIds}
          onSelectedKeepTaskIdsChange={setAiKeepTaskIds}
          onClarifyMissingContext={({ missingContext }) => {
            if (!activeAiLineId) return;
            void openClarifyScope(activeAiLineId);
            toast.info(
              missingContext.length > 0
                ? `Clarify scope opened with ${missingContext.length} gap${missingContext.length === 1 ? "" : "s"} to resolve.`
                : "Clarify scope opened for this line.",
            );
          }}
          onClose={closeAiPanel}
          onApply={handleApplyAiProposal}
        />
      ) : null}

      <ClarifyScopePanel
        open={clarifyLineId !== null}
        onClose={closeClarifyScope}
        lineId={clarifyLineId}
        lineDescription={clarifyModel?.lineDescription ?? ""}
        questionSet={clarifyModel?.matchedSet ?? null}
        savedAnswers={clarifyModel?.savedAnswers ?? null}
        alternatives={clarifyAlternatives}
        isLoading={isClarifyLoading}
        onSelectAlternative={(setKey) => void handleSelectClarifyAlternative(setKey)}
        setPickerRows={clarifySetOptions}
        pickerQueryFromParent={clarifySetOptionsQuery}
        autoMatchedSetKey={clarifyAutoMatchedSetKey}
        isSetPickerLoading={isClarifySetSearchLoading}
        onSearchSets={(query) =>
          clarifyLineId ? handleSearchClarificationSets(clarifyLineId, query) : Promise.resolve()
        }
        aiProposal={clarifyAiProposal}
        aiGeneration={clarifyAiGeneration}
        isSuggesting={isClarifySuggesting}
        onSuggest={handleSuggestClarifyAnswers}
        isGeneratingSet={isClarifySetGenerating}
        onGenerateSet={handleGenerateClarifySetProposal}
        isCreatingSet={isClarifySetCreating}
        onCreateSet={handleCreateClarifySet}
        isUpdatingSet={isClarifySetUpdating}
        onUpdateSet={handleUpdateClarifySet}
        checkSetKey={checkClarificationSetKeyAction}
        isApplying={isClarifyApplying}
        onApply={handleApplyClarifyAnswers}
      />

      <QuoteScopeCapturePanel
        open={scopeCaptureOpen}
        onClose={closeScopeCapture}
        hasIntakeNotes={hasIntakeNotes}
        hasInternalNotes={hasInternalNotesForCapture}
        hasScopeSummary={hasScopeSummary}
        captureText={scopeCaptureText}
        onCaptureTextChange={setScopeCaptureText}
        additionalInstructions={scopeAdditionalInstructions}
        onAdditionalInstructionsChange={setScopeAdditionalInstructions}
        sources={scopeCaptureSources}
        onSourcesChange={setScopeCaptureSources}
        proposal={scopeProposal}
        generation={scopeGeneration}
        isGenerating={isScopeGenerating}
        isApplying={isScopeApplying}
        onGenerate={handleGenerateScopeSuggestions}
        onApply={handleApplyScopeSuggestions}
      />
    </div>
  );
}





