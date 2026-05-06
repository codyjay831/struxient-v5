"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  addQuoteLineItemAction,
  applyLineItemTemplateToQuoteAction,
  archiveLineItemTemplateAction,
  deleteQuoteLineItemAction,
  updateDraftQuoteDetailsAction,
  updateQuoteLineItemAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";
import {
  QUOTE_FIELD_LIMITS,
  QUOTE_LINE_FIELD_LIMITS,
} from "@/app/(workspace)/quotes/quote-field-limits";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import {
  formatCentsAsDollarInput,
  formatMoneyCents,
  type QuoteLineItemPayload,
} from "@/lib/quote-display";
import { SectionHeading } from "@/components/ui/section-heading";
import { WorkspacePanel } from "@/components/ui/workspace-panel";
import { SignalCard } from "@/components/ui/signal-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  QuoteLineDraftExecutionSummary,
  QuoteLineItemScanBlock,
} from "@/components/quotes/quote-line-item-display";
import type { QuoteLineDraftExecutionTaskRow } from "@/components/quotes/quote-line-draft-execution-panel";
import type { ReusableTaskPickerOption } from "@/lib/line-item-template-default-execution-display";
import {
  CustomerProposalOptionalFields,
  LINE_PROPOSAL_NAMES,
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { Library, ListOrdered } from "lucide-react";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const initialActionState: QuoteFormState = {};

function FormError({ message }: { message: string }) {
  return (
    <p
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-danger"
      role="alert"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

function QuoteDraftDetailsForm({
  quoteId,
  initialTitle,
  initialInternalNotes,
  initialCustomerDocumentTitle,
}: {
  quoteId: string;
  initialTitle: string;
  initialInternalNotes: string | null;
  initialCustomerDocumentTitle: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    updateDraftQuoteDetailsAction.bind(null, quoteId),
    initialActionState,
  );

  return (
    <WorkspacePanel className="mb-6">
      <SectionHeading
        title="Draft details"
        description="Staff workspace fields: title and internal notes stay here on the working quote. Optional proposal document title is separate—it only shapes the live proposal preview when set (otherwise the workspace title is used there)."
      />
      <form action={formAction} className="space-y-4">
        {state.error ? <FormError message={state.error} /> : null}
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Workspace title</span>
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
            <span className={fieldLabelClass}>Internal notes (optional)</span>
            <textarea
              name="internalNotes"
              rows={4}
              maxLength={QUOTE_FIELD_LIMITS.internalNotes}
              defaultValue={initialInternalNotes ?? ""}
              placeholder="Staff-only—omitted from live proposal preview."
              className={controlClass}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Proposal document title (optional)</span>
            <input
              name="customerDocumentTitle"
              type="text"
              maxLength={QUOTE_FIELD_LIMITS.customerDocumentTitle}
              defaultValue={initialCustomerDocumentTitle ?? ""}
              placeholder="Shown on live proposal preview instead of workspace title when set"
              className={controlClass}
              autoComplete="off"
            />
          </label>
        </div>
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save quote details"}
        </button>
      </form>
    </WorkspacePanel>
  );
}

function QuoteLineAddForm({ quoteId, onCancel }: { quoteId: string; onCancel: () => void }) {
  const [state, formAction, isPending] = useActionState(
    addQuoteLineItemAction.bind(null, quoteId),
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
          Add line item
        </p>
        <button
          type="button"
          className="text-[0.65rem] font-medium text-foreground-subtle hover:text-foreground"
          onClick={onCancel}
        >
          Close
        </button>
      </div>
      <p className="text-xs leading-relaxed text-foreground-muted">
        Enter staff scope and pricing first. Optional proposal wording lives in the collapsible section
        below—it does not appear on this list until you expand it. Line total is computed on the server from
        quantity × unit price; quote subtotal and total update in the same request.
      </p>
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Staff scope (internal description)</span>
          <input
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
        <button type="button" className={secondaryButtonClass} onClick={onCancel} disabled={isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function QuoteLineTemplateApplyList({
  quoteId,
  templates,
}: {
  quoteId: string;
  templates: LineItemTemplatePickerRow[];
}) {
  if (templates.length === 0) {
    return (
      <div className="mt-5">
        <EmptyState
          icon={Library}
          title="No saved line items yet"
          description="Use Add line item above for one-off rows, or create saved line items in Sales → Scope Library. Copying adds a new line with duplicated commercial fields and copies default draft execution when the saved line item has it."
        />
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-2">
      <p className="text-xs leading-relaxed text-foreground-muted">
        Newest saved line items first. Hiding one removes it from this list only—lines already on quotes
        stay unchanged.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
      {templates.map((t) => (
        <li
          key={t.id}
          className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t.description}</p>
            <p className="mt-1 text-xs text-foreground-muted">
              Defaults: {t.defaultQuantityDisplay} × {formatMoneyCents(t.defaultUnitAmountCents)}{" "}
              unit
              {t.hasCustomerProposalDefaults ? (
                <span className="mt-1 block text-foreground-subtle">
                  Includes default proposal wording (copied into new lines only).
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ApplyTemplateForm quoteId={quoteId} templateId={t.id} />
            <ArchiveTemplateForm quoteId={quoteId} templateId={t.id} />
          </div>
        </li>
      ))}
      </ul>
    </div>
  );
}

function ApplyTemplateForm({ quoteId, templateId }: { quoteId: string; templateId: string }) {
  const [state, formAction, isPending] = useActionState(
    applyLineItemTemplateToQuoteAction.bind(null, quoteId, templateId),
    initialActionState,
  );

  return (
    <form action={formAction} className="inline">
      {state.error ? (
        <p className="mb-1 text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={secondaryButtonClass} disabled={isPending}>
        {isPending ? "Copying…" : "Copy line to quote"}
      </button>
    </form>
  );
}

function ArchiveTemplateForm({ quoteId, templateId }: { quoteId: string; templateId: string }) {
  const [state, formAction, isPending] = useActionState(
    archiveLineItemTemplateAction.bind(null, quoteId, templateId),
    initialActionState,
  );

  return (
    <form action={formAction} className="inline">
      {state.error ? (
        <p className="mb-1 text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        className={secondaryButtonClass}
        disabled={isPending}
        title="Hide this saved line item from the picker. Lines you already copied onto quotes are not changed."
      >
        {isPending ? "Hiding…" : "Hide from picker"}
      </button>
    </form>
  );
}

function QuoteLineEditBlock({
  quoteId,
  line,
  onDone,
}: {
  quoteId: string;
  line: QuoteLineItemPayload;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    updateQuoteLineItemAction.bind(null, quoteId, line.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-border pt-3">
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
        <button type="button" className={secondaryButtonClass} onClick={onDone} disabled={isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function QuoteLineDeleteForm({ quoteId, lineId }: { quoteId: string; lineId: string }) {
  const [state, formAction, isPending] = useActionState(
    deleteQuoteLineItemAction.bind(null, quoteId, lineId),
    initialActionState,
  );

  return (
    <form action={formAction} className="inline">
      {state.error ? (
        <p className="mb-2 text-xs text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={dangerButtonClass} disabled={isPending}>
        {isPending ? "Removing…" : "Delete line"}
      </button>
    </form>
  );
}

export type QuoteDraftWorkspaceControlsProps = {
  id?: string;
  quoteId: string;
  initialTitle: string;
  initialInternalNotes: string | null;
  initialCustomerDocumentTitle: string | null;
  subtotalCents: number;
  totalCents: number;
  lineItems: QuoteLineItemPayload[];
  lineItemTemplates: LineItemTemplatePickerRow[];
  draftTasksByLineId: Record<string, QuoteLineDraftExecutionTaskRow[]>;
  reusableTaskOptions: ReusableTaskPickerOption[];
};

export function QuoteDraftWorkspaceControls({
  id,
  quoteId,
  initialTitle,
  initialInternalNotes,
  initialCustomerDocumentTitle,
  subtotalCents,
  totalCents,
  lineItems,
  lineItemTemplates,
  draftTasksByLineId,
  reusableTaskOptions,
}: QuoteDraftWorkspaceControlsProps) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const lineCount = lineItems.length;

  return (
    <>
      <QuoteDraftDetailsForm
        quoteId={quoteId}
        initialTitle={initialTitle}
        initialInternalNotes={initialInternalNotes}
        initialCustomerDocumentTitle={initialCustomerDocumentTitle}
      />

      <WorkspacePanel id={id} className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Line items"
          description="Each row is commercial scope and pricing first. Internal draft execution and light planning (shared stages vs separate scope, work order) stay under each line—not on the customer proposal. Subtotal and total are rollups on the quote row."
          actions={
            !isAddFormOpen ? (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setIsAddFormOpen(true)}
              >
                Add line item
              </button>
            ) : null
          }
        />
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <SignalCard
            label="Subtotal"
            value={formatMoneyCents(subtotalCents)}
            hint="Sum of line totals (server recomputed)."
          />
          <SignalCard
            label="Total"
            value={formatMoneyCents(totalCents)}
            hint="Same as subtotal for now—no tax line on the quote row."
          />
          <SignalCard
            label="Lines"
            value={String(lineCount)}
            hint="Persisted rows, ordered for display."
          />
        </div>

        {isAddFormOpen ? (
          <div className="mb-6">
            <QuoteLineAddForm quoteId={quoteId} onCancel={() => setIsAddFormOpen(false)} />
          </div>
        ) : null}

        {lineCount === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={ListOrdered}
              title="No line items on this quote yet"
              description="Use Add line item above for a one-off row, or scroll to Saved line items to copy a reusable row from your Scope Library. Either path adds a normal line to this working quote."
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => setIsAddFormOpen(true)}
                >
                  Add line item
                </button>
                <Link href="/scope-library" className={secondaryButtonClass}>
                  Open Scope Library
                </Link>
              </div>
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
            {lineItems.map((line) => (
              <li key={line.id} className="px-4 py-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <QuoteLineItemScanBlock line={line} />
                    <QuoteLineDraftExecutionSummary
                      quoteId={quoteId}
                      line={line}
                      isExecutionEditable
                      draftTasks={draftTasksByLineId[line.id] ?? []}
                      reusableOptions={reusableTaskOptions}
                    />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                    {editingLineId === line.id ? null : (
                      <>
                        <button
                          type="button"
                          className={secondaryButtonClass}
                          onClick={() => setEditingLineId(line.id)}
                        >
                          Edit
                        </button>
                        <QuoteLineDeleteForm quoteId={quoteId} lineId={line.id} />
                      </>
                    )}
                  </div>
                </div>
                {editingLineId === line.id ? (
                  <QuoteLineEditBlock
                    quoteId={quoteId}
                    line={line}
                    onDone={() => setEditingLineId(null)}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 rounded-lg border border-dashed border-border bg-foreground/[0.02] p-4 sm:p-5">
          <SectionHeading
            title="Saved line items"
            description="Copy reusable quote rows from your Scope Library. Commercial fields always copy; when a saved line item has default execution, those tasks copy as independent draft execution on the new quote line."
          />
          <p className="mt-3 text-xs leading-relaxed text-foreground-muted">
            Manage saved line items in{" "}
            <Link
              href="/scope-library"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Sales → Scope Library
            </Link>
            .
          </p>
          <QuoteLineTemplateApplyList quoteId={quoteId} templates={lineItemTemplates} />
        </div>
      </WorkspacePanel>
    </>
  );
}

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
