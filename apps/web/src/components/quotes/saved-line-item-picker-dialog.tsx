"use client";

import { useRef, useState, useEffect, useActionState } from "react";
import { Search, X, Library, Plus } from "lucide-react";
import type { LineItemTemplatePickerRow } from "@/lib/line-item-template-display";
import { formatMoneyCents } from "@/lib/quote-display";
import {
  applyLineItemTemplateToQuoteAction,
  archiveLineItemTemplateAction,
  type QuoteFormState,
} from "@/app/(workspace)/quotes/quote-form-actions";
import {
  applyLineItemTemplateToQuoteWorkspaceAction,
  type QuoteWorkspaceActionState,
} from "@/app/(workspace)/workstation/quote-workspace-actions";
import {
  workspaceFormSecondaryButtonClass,
} from "@/components/line-item-templates/line-item-template-form-fields";

const initialActionState: QuoteFormState = {};
const initialWorkspaceState: QuoteWorkspaceActionState = {};

interface SavedLineItemPickerDialogProps {
  quoteId: string;
  templates: LineItemTemplatePickerRow[];
  /**
   * Optional callback for workspace-safe application. When provided, the
   * picker uses `applyLineItemTemplateToQuoteWorkspaceAction` (no redirect)
   * and calls this after success.
   */
  onApplied?: () => void;
  /**
   * Optional variant for the trigger button.
   * 'standard' (default) - large dashed box with description
   * 'compact' - simple secondary button
   */
  triggerVariant?: "standard" | "compact";
  /**
   * When this becomes true, opens the dialog programmatically (e.g. from the
   * quote Overview “Add from Scope Library” next step). Parent should clear
   * via `onRequestOpenConsumed` after the dialog opens.
   */
  requestOpen?: boolean;
  onRequestOpenConsumed?: () => void;
}

export function SavedLineItemPickerDialog({
  quoteId,
  templates,
  onApplied,
  triggerVariant = "standard",
  requestOpen = false,
  onRequestOpenConsumed,
}: SavedLineItemPickerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "name">("newest");

  useEffect(() => {
    if (!requestOpen) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      dialogRef.current?.showModal();
      onRequestOpenConsumed?.();
    });
    return () => {
      cancelled = true;
    };
  }, [requestOpen, onRequestOpenConsumed]);

  function open() {
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  const filteredTemplates = templates
    .filter((t) =>
      t.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortOrder === "name") {
        return a.description.localeCompare(b.description);
      }
      // "newest" is the default order from the server (updatedAt desc)
      return 0;
    });

  return (
    <>
      {triggerVariant === "standard" ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-foreground/[0.02] p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-md">
              <h3 className="text-sm font-semibold text-foreground">Add from Scope Library</h3>
              <p className="mt-1 text-xs text-foreground-muted">
                Copy reusable quote rows from your Scope Library. Commercial fields and default execution tasks always copy together.
              </p>
            </div>
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-foreground/[0.02]"
            >
              <Library className="size-4" />
              Browse Scope Library
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={open}
          className={workspaceFormSecondaryButtonClass}
        >
          <Library className="mr-1.5 size-3.5" strokeWidth={2} />
          Add from Scope Library
        </button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="saved-line-item-picker-title"
        className="z-50 w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl border border-border bg-surface p-0 text-foreground shadow-lg outline-none ring-offset-background [&::backdrop]:bg-foreground/25"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="flex max-h-[min(40rem,90vh)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2
                id="saved-line-item-picker-title"
                className="text-sm font-semibold tracking-tight text-foreground"
              >
                Browse Scope Library
              </h2>
              <p className="mt-1 text-xs text-foreground-muted">
                Search and select saved line items to add to this quote.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded-md p-1 text-foreground-subtle transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              aria-label="Close picker"
            >
              <X className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          <div className="border-b border-border bg-foreground/[0.01] px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle" />
                <input
                  type="search"
                  placeholder="Search by name..."
                  className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-foreground-subtle focus:outline-none focus:ring-2 focus:ring-ring"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <select
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as "newest" | "name")}
              >
                <option value="newest">Newest</option>
                <option value="name">Name A–Z</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-2">
            {filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Library className="mb-3 size-8 text-foreground-subtle opacity-50" />
                <p className="text-sm font-medium text-foreground">No saved line items found</p>
                <p className="mt-1 text-xs text-foreground-muted">
                  {searchQuery ? "Try a different search term." : "Your Scope Library is empty."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredTemplates.map((t) => (
                  <li key={t.id} className="group py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                          {t.description}
                        </p>
                        <p className="mt-1 text-xs text-foreground-muted">
                          {t.defaultQuantityDisplay} × {formatMoneyCents(t.defaultUnitAmountCents)}
                          {t.hasCustomerProposalDefaults && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                              Has proposal wording
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {onApplied ? (
                          <ApplyTemplateWorkspaceForm
                            quoteId={quoteId}
                            templateId={t.id}
                            onSuccess={() => {
                              close();
                              onApplied();
                            }}
                          />
                        ) : (
                          <ApplyTemplateForm quoteId={quoteId} templateId={t.id} />
                        )}
                        <ArchiveTemplateForm quoteId={quoteId} templateId={t.id} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border px-5 py-4 bg-foreground/[0.01]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-foreground-muted uppercase tracking-wider font-semibold">
                {filteredTemplates.length} item{filteredTemplates.length === 1 ? "" : "s"} available
              </p>
              <button
                type="button"
                onClick={close}
                className={workspaceFormSecondaryButtonClass}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ApplyTemplateForm({ quoteId, templateId }: { quoteId: string; templateId: string }) {
  const [state, formAction, isPending] = useActionState(
    applyLineItemTemplateToQuoteAction.bind(null, quoteId, templateId),
    initialActionState,
  );

  return (
    <form action={formAction}>
      {state.error ? (
        <p className="mb-1 text-[10px] text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        disabled={isPending}
      >
        <Plus className="size-3.5" />
        {isPending ? "Adding…" : "Add to quote"}
      </button>
    </form>
  );
}

function ApplyTemplateWorkspaceForm({
  quoteId,
  templateId,
  onSuccess,
}: {
  quoteId: string;
  templateId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    applyLineItemTemplateToQuoteWorkspaceAction.bind(null, quoteId, templateId),
    initialWorkspaceState,
  );

  useEffect(() => {
    if (state.success) onSuccess();
  }, [state.success, onSuccess]);

  return (
    <form action={formAction}>
      {state.error ? (
        <p className="mb-1 text-[10px] text-danger" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        disabled={isPending}
      >
        <Plus className="size-3.5" />
        {isPending ? "Adding…" : "Add to quote"}
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
    <form action={formAction}>
      <button
        type="submit"
        className="rounded-lg border border-border bg-surface p-1.5 text-foreground-subtle transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:opacity-50"
        disabled={isPending}
        title="Hide from picker"
      >
        <X className="size-3.5" />
      </button>
    </form>
  );
}
