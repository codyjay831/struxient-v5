/** Serializable row for quote draft template picker (org-scoped, non-archived). */
export type LineItemTemplatePickerRow = {
  id: string;
  description: string;
  defaultQuantityDisplay: string;
  defaultUnitAmountCents: number;
  hasCustomerProposalDefaults: boolean;
};
