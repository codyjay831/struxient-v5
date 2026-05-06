/** Serializable row for quote draft template picker (org-scoped, non-archived). */
export type LineItemTemplatePickerRow = {
  id: string;
  description: string;
  defaultQuantityDisplay: string;
  defaultUnitAmountCents: number;
  hasCustomerProposalDefaults: boolean;
};

/** Staff-only Scope Library row for editing presets (org-scoped, non-archived). */
export type LineItemTemplateLibraryRow = {
  id: string;
  description: string;
  defaultQuantityDisplay: string;
  defaultUnitAmountCents: number;
  defaultUnitAmountDollars: string;
  defaultInternalNotes: string | null;
  defaultCustomerScopeTitle: string | null;
  defaultCustomerScopeDescription: string | null;
  defaultCustomerIncludedNotes: string | null;
  defaultCustomerExcludedNotes: string | null;
  defaultCustomerPresentationGroup: string | null;
  hasCustomerProposalDefaults: boolean;
  /** Optional default execution — summary only on list cards. */
  executionSummary: {
    taskCount: number;
    summaryLine: string | null;
  };
};
