"use client";

/**
 * QuoteLineItemsWorkspaceEditor — workspace-safe Scope tab body.
 *
 * Used inside QuoteWorkSurface in `standard` (Quotes popup, Lead Quote tab)
 * and `compact` (Workstation drawer) modes when the quote is editable
 * (DRAFT). Calls the workspace-safe `*WorkspaceAction` server actions which
 * return `{ success } | { error }` instead of `redirect()`, so the
 * surrounding popup/drawer/lead-tab stays open after add/edit/delete and
 * after applying a Scope Library template.
 *
 * Full-mode (the `/quotes/[id]` page) still uses
 * `QuoteDraftWorkspaceControls` because that bundles execution editing,
 * draft details, and the full-page Scope Library editor — those are
 * intentionally out of scope for the inline workspace-safe editor. The
 * Scope Library *picker* itself is now reused here (workspace-safe mode)
 * via `SavedLineItemPickerDialog`.
 *
 * Per-line execution planning is also supported in-place via the
 * `QuoteLineDraftExecutionSummary` component.
 */

import { useEffect, useRef, useState, useActionState } from "react";
import Link from "next/link";
import { ArrowUpRight, ListOrdered, Plus } from "lucide-react";
import {
  addQuoteLineItemWorkspaceAction,
  deleteQuoteLineItemWorkspaceAction,
  updateQuoteLineItemWorkspaceAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import { QUOTE_LINE_FIELD_LIMITS } from "@/app/(workspace)/quotes/quote-field-limits";
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

type EditorMode = "standard" | "compact";

const initialState: QuoteWorkspaceActionState = {};
const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const sectionLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

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

function AddLineItemForm({
  quoteId,
  mode,
  autoFocus,
  onSuccess,
  onCancel,
}: {
  quoteId: string;
  mode: EditorMode;
  autoFocus: boolean;
  onSuccess: () => void;
  onCancel: () => void;
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

  const isCompact = mode === "compact";

  return (
    <form
      ref={formRef}
      action={formAction}
      className={`space-y-3 rounded-lg border border-border bg-foreground/[0.02] ${isCompact ? "p-3" : "p-4"}`}
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
          <span className={fieldLabelClass}>Staff-only line notes (optional)</span>
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

function EditLineItemForm({
  quoteId,
  line,
  mode,
  onSuccess,
  onCancel,
}: {
  quoteId: string;
  line: QuoteLineItemPayload;
  mode: EditorMode;
  onSuccess: () => void;
  onCancel: () => void;
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

  const isCompact = mode === "compact";

  return (
    <form
      action={formAction}
      className={`mt-3 space-y-3 border-t border-border ${isCompact ? "pt-2" : "pt-3"}`}
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
          <span className={fieldLabelClass}>Staff-only line notes (optional)</span>
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

export type QuoteLineItemsWorkspaceEditorProps = {
  quoteId: string;
  quoteHref: string;
  lineItems: readonly QuoteLineItemPayload[];
  subtotalCents: number;
  totalCents: number;
  mode: EditorMode;
  /** Scope Library templates available to apply inline. */
  lineItemTemplates: readonly LineItemTemplatePickerRow[];
  /** Draft execution tasks grouped by line id. */
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  /** Reusable task options for copying into line execution. */
  reusableTaskOptions: ReusableTaskPickerOption[];
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
   * Workspace actions also `revalidatePath` for SSR-rendered surfaces;
   * this callback is what updates lazy-loaded popup/drawer state.
   */
  onMutated: () => void;
};

export function QuoteLineItemsWorkspaceEditor({
  quoteId,
  quoteHref,
  lineItems,
  subtotalCents,
  totalCents,
  mode,
  lineItemTemplates,
  draftTasksByLineId,
  reusableTaskOptions,
  shouldFocusAddForm = false,
  onAddOpenConsumed,
  shouldOpenScopeLibraryPicker = false,
  onScopeLibraryPickerOpenConsumed,
  onMutated,
}: QuoteLineItemsWorkspaceEditorProps) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [autoFocusAdd, setAutoFocusAdd] = useState(false);
  const isCompact = mode === "compact";

  useEffect(() => {
    if (!shouldFocusAddForm) return;
    /* Defer setState so it doesn't run synchronously inside this effect's
     * render commit phase (matches the codebase's `Promise.resolve().then`
     * convention used elsewhere for the same React 19 rule). */
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Subtotal</p>
          <p className="text-sm font-medium text-foreground tabular-nums">
            {formatMoneyCents(subtotalCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Total</p>
          <p className="text-sm font-medium text-foreground tabular-nums">
            {formatMoneyCents(totalCents)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className={`${sectionLabelClass} mb-0.5`}>Lines</p>
          <p className="text-sm font-medium text-foreground">{lineCount}</p>
        </div>
      </div>

      {!isAddOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={primaryButtonClass}
            onClick={() => {
              setIsAddOpen(true);
              setAutoFocusAdd(true);
            }}
          >
            <Plus className="mr-1 size-3.5" strokeWidth={2} />
            Add line item
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
      ) : (
        <AddLineItemForm
          quoteId={quoteId}
          mode={mode}
          autoFocus={autoFocusAdd}
          onSuccess={handleAddSuccess}
          onCancel={() => {
            setIsAddOpen(false);
            setAutoFocusAdd(false);
          }}
        />
      )}

      {lineCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-center">
          <ListOrdered
            className="mx-auto mb-2 size-6 text-foreground-subtle opacity-70"
            strokeWidth={1.25}
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">
            No line items yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
            Add custom scope or copy reusable scope from the Scope Library using
            the buttons above.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {lineItems.map((line) => {
            const isEditing = editingLineId === line.id;
            return (
              <li key={line.id} className={isCompact ? "px-3 py-3" : "px-4 py-4"}>
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
                    />
                  </div>
                  {isEditing ? null : (
                    <div className="flex shrink-0 items-center gap-2">
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
                  )}
                </div>
                {isEditing ? (
                  <EditLineItemForm
                    quoteId={quoteId}
                    line={line}
                    mode={mode}
                    onSuccess={handleEditSuccess}
                    onCancel={() => setEditingLineId(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer escape hatch — secondary link for advanced full-page editing. */}
      <div className="pt-1">
        <Link
          href={`${quoteHref}#line-items`}
          className="inline-flex items-center gap-1 text-[10px] text-foreground-subtle underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Open full quote page for advanced editing
          <ArrowUpRight className="size-2.5" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
