"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  archiveLineItemTemplateFromScopeLibraryAction,
  createLineItemTemplateFromScopeLibraryAction,
  updateLineItemTemplateFromScopeLibraryAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";
import { QUOTE_LINE_FIELD_LIMITS } from "@/app/(workspace)/quotes/quote-field-limits";
import {
  CustomerProposalOptionalFields,
  TEMPLATE_PROPOSAL_NAMES,
  workspaceFormControlClass,
  workspaceFormDangerButtonClass,
  workspaceFormFieldLabelClass,
  workspaceFormPrimaryButtonClass,
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import type { LineItemTemplateLibraryRow } from "@/lib/line-item-template-display";
import { formatMoneyCents } from "@/lib/quote-display";
import { Library } from "lucide-react";

import { TagPicker } from "@/components/ui/tag-picker";
import type { TagDisplay } from "@/lib/line-item-template-display";

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;
const primaryButtonClass = workspaceFormPrimaryButtonClass;
const secondaryButtonClass = workspaceFormSecondaryButtonClass;
const dangerButtonClass = workspaceFormDangerButtonClass;

const anchorToFormClass =
  "text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground";

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

function ScopeLibraryCreatePresetForm({ availableTags }: { availableTags: TagDisplay[] }) {
  const [state, formAction, isPending] = useActionState(
    createLineItemTemplateFromScopeLibraryAction,
    initialActionState,
  );

  const [selectedTags, setSelectedTags] = useState<TagDisplay[]>([]);
  const [description, setDescription] = useState("");

  return (
    <form
      id="scope-library-line-preset-create"
      action={formAction}
      className="mb-8 space-y-3 scroll-mt-24 rounded-lg border border-border bg-surface px-4 py-4"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-foreground-subtle">
        New saved line item
      </p>
      <p className="text-xs leading-relaxed text-foreground-muted">
        Saves commercial defaults for your organization. Applying a saved line item on a draft quote inserts a{" "}
        <span className="font-medium text-foreground">new copied line</span>—lines are never
        live-linked back to the library.
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabelClass}>Price buffer (%)</span>
          <input
            name="priceBufferPercentage"
            type="number"
            min="0"
            max="100"
            defaultValue="0"
            className={controlClass}
            placeholder="e.g. 10 for 10%"
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Tags</span>
          <TagPicker
            availableTags={availableTags}
            selectedTags={selectedTags}
            onChange={setSelectedTags}
            onSuggest={async () => {
              if (!description) return [];
              const res = await fetch("/api/ai/suggest-tags", {
                method: "POST",
                body: JSON.stringify({ title: description }),
              });
              const data = await res.json();
              return data.suggestions || [];
            }}
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
            placeholder="Copied to the quote line as internal notes when applied—not shown on live proposal preview."
          />
        </label>
      </div>
      <CustomerProposalOptionalFields names={TEMPLATE_PROPOSAL_NAMES} variant="template" />
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
        {isPending ? "Saving…" : "Save saved line item"}
      </button>
    </form>
  );
}

function ScopeLibraryTemplateEditForm({
  template,
  availableTags,
  onDone,
}: {
  template: LineItemTemplateLibraryRow;
  availableTags: TagDisplay[];
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    updateLineItemTemplateFromScopeLibraryAction.bind(null, template.id),
    initialActionState,
  );

  const [selectedTags, setSelectedTags] = useState<TagDisplay[]>(template.tags);

  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-border pt-3">
      {state.error ? <FormError message={state.error} /> : null}
      <div>
        <label className="block">
          <span className={fieldLabelClass}>Internal description (preset)</span>
          <input
            name="description"
            type="text"
            required
            maxLength={QUOTE_LINE_FIELD_LIMITS.description}
            defaultValue={template.description}
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
            defaultValue={template.defaultQuantityDisplay}
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
            defaultValue={template.defaultUnitAmountDollars}
            className={controlClass}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabelClass}>Price buffer (%)</span>
          <input
            name="priceBufferPercentage"
            type="number"
            min="0"
            max="100"
            defaultValue={template.priceBufferPercentage}
            className={controlClass}
          />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Tags</span>
          <TagPicker
            availableTags={availableTags}
            selectedTags={selectedTags}
            onChange={setSelectedTags}
            onSuggest={async () => {
              const res = await fetch("/api/ai/suggest-tags", {
                method: "POST",
                body: JSON.stringify({ title: template.description }),
              });
              const data = await res.json();
              return data.suggestions || [];
            }}
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
            defaultValue={template.defaultInternalNotes ?? ""}
            className={controlClass}
            placeholder="Copied to the quote line as internal notes when applied—not shown on live proposal preview."
          />
        </label>
      </div>
      <CustomerProposalOptionalFields
        names={TEMPLATE_PROPOSAL_NAMES}
        variant="template"
        defaults={{
          scopeTitle: template.defaultCustomerScopeTitle,
          scopeDescription: template.defaultCustomerScopeDescription,
          includedNotes: template.defaultCustomerIncludedNotes,
          excludedNotes: template.defaultCustomerExcludedNotes,
          presentationGroup: template.defaultCustomerPresentationGroup,
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={onDone} disabled={isPending}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ScopeLibraryArchiveForm({ templateId }: { templateId: string }) {
  const [state, formAction, isPending] = useActionState(
    archiveLineItemTemplateFromScopeLibraryAction.bind(null, templateId),
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
        className={dangerButtonClass}
        disabled={isPending}
        title="Hide this preset from the library and quote pickers. Lines already copied onto quotes are not changed."
      >
        {isPending ? "Hiding…" : "Hide preset"}
      </button>
    </form>
  );
}

export function ScopeLibraryLinePresetsPanel({
  templates,
  availableTags,
}: {
  templates: LineItemTemplateLibraryRow[];
  availableTags: TagDisplay[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      <SectionHeading
        title="Saved line items"
        description="Commercial defaults and optional proposal wording—plus optional default execution you can copy into quotes later. Newest updated first."
      />
      <ScopeLibraryCreatePresetForm availableTags={availableTags} />
      {templates.length === 0 ? (
        <EmptyState
          icon={Library}
          title="No saved line items yet"
          description="Add your first saved line item using the form above: internal description, default quantity and unit price, optional internal notes, and optional proposal wording. After you save, copy into draft quotes from the quote workspace."
        >
          <a href="#scope-library-line-preset-create" className={anchorToFormClass}>
            Jump to new saved line item form
          </a>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {templates.map((t) => (
            <li key={t.id} className="px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.description}</p>
                  {t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-foreground-muted">
                    Defaults: {t.defaultQuantityDisplay} × {formatMoneyCents(t.defaultUnitAmountCents)}{" "}
                    unit
                    {t.priceBufferPercentage > 0 && (
                      <span className="ml-1 text-foreground-subtle">
                        (+{t.priceBufferPercentage}% buffer)
                      </span>
                    )}
                    {t.hasCustomerProposalDefaults ? (
                      <span className="mt-1 block text-foreground-subtle">
                        Includes default proposal wording (copied into new lines only).
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-xs text-foreground-subtle">
                    {t.executionSummary.taskCount === 0
                      ? "No default execution saved"
                      : t.executionSummary.summaryLine}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {editingId === t.id ? null : (
                    <>
                      <Link
                        href={`/settings/scope-library/line-presets/${t.id}/default-execution`}
                        className={secondaryButtonClass}
                      >
                        {t.executionSummary.taskCount === 0 ? "Add default execution" : "Edit default execution"}
                      </Link>
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        onClick={() => setEditingId(t.id)}
                      >
                        Edit pricing and scope
                      </button>
                      <ScopeLibraryArchiveForm templateId={t.id} />
                    </>
                  )}
                </div>
              </div>
              {editingId === t.id ? (
                <ScopeLibraryTemplateEditForm 
                  template={t} 
                  availableTags={availableTags}
                  onDone={() => setEditingId(null)} 
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
