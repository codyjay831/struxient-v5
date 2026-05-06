"use client";

import { QUOTE_PROPOSAL_FIELD_LIMITS } from "@/app/(workspace)/quotes/quote-field-limits";

/** Semantic workspace form tokens (theme-driven; shared by quote authoring and line preset forms). */
export const workspaceFormFieldLabelClass =
  "text-[0.65rem] font-medium uppercase tracking-wide text-foreground-subtle";

export const workspaceFormControlClass =
  "mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const workspaceFormPrimaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border bg-accent px-4 py-2 text-xs font-medium text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

export const workspaceFormSecondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:border-border-strong hover:bg-foreground/[0.02] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60";

export const workspaceFormDangerButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-danger/40 bg-surface px-3 py-2 text-xs font-medium text-danger transition-colors hover:border-danger hover:bg-danger/[0.04] disabled:cursor-not-allowed disabled:opacity-60";

const proposalOptionalDetailsClass =
  "mt-3 rounded-lg border border-dashed border-border bg-surface/80 px-3 py-2";

export type CustomerProposalFieldNames = {
  scopeTitle: string;
  scopeDescription: string;
  includedNotes: string;
  excludedNotes: string;
  presentationGroup: string;
};

/** Form `name` attributes for quote line customer proposal fields. */
export const LINE_PROPOSAL_NAMES: CustomerProposalFieldNames = {
  scopeTitle: "customerScopeTitle",
  scopeDescription: "customerScopeDescription",
  includedNotes: "customerIncludedNotes",
  excludedNotes: "customerExcludedNotes",
  presentationGroup: "customerPresentationGroup",
};

/** Form `name` attributes matching [LineItemTemplate] default customer proposal columns. */
export const TEMPLATE_PROPOSAL_NAMES: CustomerProposalFieldNames = {
  scopeTitle: "defaultCustomerScopeTitle",
  scopeDescription: "defaultCustomerScopeDescription",
  includedNotes: "defaultCustomerIncludedNotes",
  excludedNotes: "defaultCustomerExcludedNotes",
  presentationGroup: "defaultCustomerPresentationGroup",
};

const fieldLabelClass = workspaceFormFieldLabelClass;
const controlClass = workspaceFormControlClass;

export function CustomerProposalOptionalFields({
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
      : "Separate from internal description and internal notes. Shown on the live proposal preview; proposal scope title falls back to internal description for the line title when left blank.";
  return (
    <details className={proposalOptionalDetailsClass}>
      <summary className="cursor-pointer select-none text-xs font-medium text-foreground-muted">
        Proposal wording (optional)
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-foreground-muted">{helperCopy}</p>
      <div className="mt-3 space-y-3 pb-1">
        <label className="block">
          <span className={fieldLabelClass}>Proposal scope title</span>
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
          <span className={fieldLabelClass}>Proposal scope description</span>
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
