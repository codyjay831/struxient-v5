export type TagDisplay = {
  id: string;
  name: string;
  color: string | null;
};

/** Serializable row for quote draft template picker (org-scoped, non-archived). */
export type LineItemTemplatePickerRow = {
  id: string;
  description: string;
  defaultQuantityDisplay: string;
  defaultUnitAmountCents: number;
  /** Matches `computeLineTotalCents` on the server (canonical template apply). */
  defaultLineTotalCents: number;
  hasCustomerProposalDefaults: boolean;
  priceBufferPercentage: number;
  tags: TagDisplay[];
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
  priceBufferPercentage: number;
  tags: TagDisplay[];
  /** Optional default execution — summary only on list cards. */
  executionSummary: {
    taskCount: number;
    summaryLine: string | null;
  };
};
