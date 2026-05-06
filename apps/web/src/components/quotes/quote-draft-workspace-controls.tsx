"use client";

import { useActionState, useState } from "react";
import {
  addQuoteLineItemAction,
  applyLineItemTemplateToQuoteAction,
  archiveLineItemTemplateAction,
  createLineItemTemplateAction,
  deleteQuoteLineItemAction,
  updateDraftQuoteDetailsAction,
  updateQuoteLineItemAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";
import {
  QUOTE_FIELD_LIMITS,
  QUOTE_LINE_FIELD_LIMITS,
  QUOTE_PROPOSAL_FIELD_LIMITS,
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
import { QuoteLineItemScanBlock } from "@/components/quotes/quote-line-item-display";
import { Library, ListOrdered } from "lucide-react";

const fieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";
const controlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-danger/40 bg-surface px-3 py-2 text-xs font-medium text-danger transition-colors hover:border-danger hover:bg-danger/[0.04] disabled:cursor-not-allowed disabled:opacity-60";

const proposalOptionalDetailsClass =
  "mt-3 rounded-lg border border-dashed border-border bg-surface/80 px-3 py-2";

const initialActionState: QuoteFormState = {};

type CustomerProposalFieldNames = {
  scopeTitle: string;
  scopeDescription: string;
  includedNotes: string;
  excludedNotes: string;
  presentationGroup: string;
};

const LINE_PROPOSAL_NAMES: CustomerProposalFieldNames = {
  scopeTitle: "customerScopeTitle",
  scopeDescription: "customerScopeDescription",
  includedNotes: "customerIncludedNotes",
  excludedNotes: "customerExcludedNotes",
  presentationGroup: "customerPresentationGroup",
};

const TEMPLATE_PROPOSAL_NAMES: CustomerProposalFieldNames = {
  scopeTitle: "defaultCustomerScopeTitle",
  scopeDescription: "defaultCustomerScopeDescription",
  includedNotes: "defaultCustomerIncludedNotes",
  excludedNotes: "defaultCustomerExcludedNotes",
  presentationGroup: "defaultCustomerPresentationGroup",
};

function CustomerProposalOptionalFields({
  names,
  defaults,
  variant = "line",
}: {
  names: CustomerProposalFieldNames;
  defaults?: Partial<Record<keyof CustomerProposalFieldNames, string | null>>;
  variant?: "line" | "template";
}) {
  const d = defaults ?? {};
  const helperCopy =
    variant === "template"
      ? "Separate from internal preset description and internal notes. Defaults are copied into each new quote line when you apply this preset—lines are not live-linked back to the library."
      : "Separate from internal description and internal notes. Shown on the internal proposal preview; customer scope title falls back to internal description for the line title when left blank.";
  return (
    <details className={proposalOptionalDetailsClass}>
      <summary className="cursor-pointer select-none text-xs font-medium text-foreground-muted">
        Customer proposal text (optional)
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-foreground-muted">{helperCopy}</p>
      <div className="mt-3 space-y-3 pb-1">
        <label className="block">
          <span className={fieldLabelClass}>Customer scope title</span>
          <input
            name={names.scopeTitle}
            type="text"
            maxLength={QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeTitle}
            defaultValue={d.scopeTitle ?? ""}
            className={controlClass}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Customer scope description</span>
          <textarea
            name={names.scopeDescription}
            rows={3}
            maxLength={QUOTE_PROPOSAL_FIELD_LIMITS.customerScopeDescription}
            defaultValue={d.scopeDescription ?? ""}
            className={controlClass}
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Included notes</span>
          <textarea
            name={names.includedNotes}
            rows={2}
            maxLength={QUOTE_PROPOSAL_FIELD_LIMITS.customerIncludedNotes}
            defaultValue={d.includedNotes ?? ""}
            className={controlClass}
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Excluded notes</span>
          <textarea
            name={names.excludedNotes}
            rows={2}
            maxLength={QUOTE_PROPOSAL_FIELD_LIMITS.customerExcludedNotes}
            defaultValue={d.excludedNotes ?? ""}
            className={controlClass}
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Presentation group</span>
          <input
            name={names.presentationGroup}
            type="text"
            maxLength={QUOTE_PROPOSAL_FIELD_LIMITS.customerPresentationGroup}
            defaultValue={d.presentationGroup ?? ""}
            placeholder="Display-only label for proposal grouping"
            className={controlClass}
            autoComplete="off"
          />
        </label>
      </div>
    </details>
  );
}

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
        description="Workspace title and internal notes are for your team. Optional customer proposal document title appears on the internal proposal preview when set; otherwise the workspace title is used there."
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
              placeholder="Estimator-only context—not shown to the customer."
              className={controlClass}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <span className={fieldLabelClass}>Customer proposal document title (optional)</span>
            <input
              name="customerDocumentTitle"
              type="text"
              maxLength={QUOTE_FIELD_LIMITS.customerDocumentTitle}
              defaultValue={initialCustomerDocumentTitle ?? ""}
              placeholder="Shown on proposal preview instead of workspace title when set"
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

function QuoteLineAddForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, isPending] = useActionState(
    addQuoteLineItemAction.bind(null, quoteId),
    initialActionState,
  );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-foreground/[0.02] p-4">
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        Add line item
      </p>
      <p className="text-xs leading-relaxed text-foreground-muted">
        Line total is computed on the server from quantity × unit price when you add the line. Quote subtotal and total update in the same request.
      </p>
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Internal description</span>
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
          <span className={fieldLabelClass}>Line internal notes (optional)</span>
          <textarea
            name="internalNotes"
            rows={2}
            maxLength={QUOTE_LINE_FIELD_LIMITS.internalNotes}
            className={controlClass}
          />
        </label>
      </div>
      <CustomerProposalOptionalFields names={LINE_PROPOSAL_NAMES} variant="line" />
      <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Adding…" : "Add line item"}
      </button>
    </form>
  );
}

function QuoteLineTemplateCreateForm({ quoteId }: { quoteId: string }) {
  const [state, formAction, isPending] = useActionState(
    createLineItemTemplateAction.bind(null, quoteId),
    initialActionState,
  );

  return (
    <form
      action={formAction}
      className="mt-5 space-y-3 rounded-lg border border-border bg-surface px-4 py-4"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        New preset
      </p>
      <p className="text-xs leading-relaxed text-foreground-muted">
        Saves commercial defaults (description, quantity, unit price, optional internal notes, optional
        customer proposal defaults) to your organization library. Applying a preset always inserts a{" "}
        <span className="font-medium text-foreground">new copied line</span> with duplicated values—lines
        are never live-linked back to the preset.
      </p>
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Internal description (preset)</span>
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
          <span className={fieldLabelClass}>Default quantity</span>
          <input
            name="quantity"
            type="text"
            required
            inputMode="decimal"
            placeholder="e.g. 1 or 4"
            className={controlClass}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Default unit price (USD)</span>
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
          <span className={fieldLabelClass}>Template internal notes (optional)</span>
          <textarea
            name="defaultInternalNotes"
            rows={2}
            maxLength={QUOTE_LINE_FIELD_LIMITS.internalNotes}
            className={controlClass}
            placeholder="Copied to the quote line as internal notes when applied—not shown in customer preview."
          />
        </label>
      </div>
      <CustomerProposalOptionalFields names={TEMPLATE_PROPOSAL_NAMES} variant="template" />
      <button type="submit" className={secondaryButtonClass} disabled={isPending}>
        {isPending ? "Saving…" : "Save preset to library"}
      </button>
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
          title="No saved presets yet"
          description="This section is optional. Use Add line item for one-off rows, or save a preset below when you reuse the same scope and pricing often. Copying a preset always adds a new line with duplicated values."
        />
      </div>
    );
  }

  return (
    <div className="mt-5 space-y-2">
      <p className="text-xs leading-relaxed text-foreground-muted">
        Newest presets first. Hiding a preset removes it from this list only—lines already on quotes
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
              Preset defaults: {t.defaultQuantityDisplay} × {formatMoneyCents(t.defaultUnitAmountCents)}{" "}
              unit
              {t.hasCustomerProposalDefaults ? (
                <span className="mt-1 block text-foreground-subtle">
                  Includes default customer proposal text (copied into new lines only).
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
        title="Hide this preset from the picker. Lines you already copied onto quotes are not changed."
      >
        {isPending ? "Hiding…" : "Hide preset"}
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
          <span className={fieldLabelClass}>Internal description</span>
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
          <span className={fieldLabelClass}>Line internal notes (optional)</span>
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
  quoteId: string;
  initialTitle: string;
  initialInternalNotes: string | null;
  initialCustomerDocumentTitle: string | null;
  subtotalCents: number;
  totalCents: number;
  lineItems: QuoteLineItemPayload[];
  lineItemTemplates: LineItemTemplatePickerRow[];
};

export function QuoteDraftWorkspaceControls({
  quoteId,
  initialTitle,
  initialInternalNotes,
  initialCustomerDocumentTitle,
  subtotalCents,
  totalCents,
  lineItems,
  lineItemTemplates,
}: QuoteDraftWorkspaceControlsProps) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const lineCount = lineItems.length;

  return (
    <>
      <QuoteDraftDetailsForm
        quoteId={quoteId}
        initialTitle={initialTitle}
        initialInternalNotes={initialInternalNotes}
        initialCustomerDocumentTitle={initialCustomerDocumentTitle}
      />

      <WorkspacePanel className="border-border-strong shadow-md ring-1 ring-ring/30">
        <SectionHeading
          title="Line items"
          description="Internal commercial scope rows (description and notes) stay on this workspace. Optional customer proposal text is edited below per line and only shapes the internal proposal preview until send exists. Subtotal and total are rollups on the quote row."
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
            hint="Same as subtotal for now—no tax or payment schedule."
          />
          <SignalCard
            label="Lines"
            value={String(lineCount)}
            hint="Persisted rows, ordered for display."
          />
        </div>

        <QuoteLineAddForm quoteId={quoteId} />

        {lineCount === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={ListOrdered}
              title="Add your first line item"
              description="Use Add line item above for internal description, quantity, and unit price. Optional internal notes and optional customer proposal text stay separated—proposal copy opens in a collapsed section so the fast path stays quick."
            />
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface">
            {lineItems.map((line) => (
              <li key={line.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <QuoteLineItemScanBlock line={line} />
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
            title="Reusable line presets"
            description="Optional accelerators for your organization—skip entirely if you prefer typing each line. Presets only store commercial defaults (no tasks or stages). Copying a preset inserts a new line with duplicated values; it does not stay linked to the preset."
          />
          <QuoteLineTemplateCreateForm quoteId={quoteId} />
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
        This is not a customer-facing quote page. Title, internal notes, and line items cannot be
        changed until you restore to draft. The only state change from here is restore; send,
        approval, payments, and job activation are not in this product phase.
      </p>
    </WorkspacePanel>
  );
}
