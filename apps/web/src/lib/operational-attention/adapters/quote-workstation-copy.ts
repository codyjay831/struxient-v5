export type QuoteWorkstationCopy = {
  status: string;
  reason: string;
  nextStep: string;
};

export type DeriveQuoteWorkstationCopyInput = {
  baseStatus: string;
  baseReason: string;
  baseNextStep: string;
  isApprovedQuoteHandoff: boolean;
  isCustomerAccepted: boolean;
  openChangeRequest: {
    requiresVisit: boolean;
    hasDraftRevision: boolean;
    draftRevisionHasLineItems: boolean;
  } | null;
  openSalesVisit: {
    isPending: boolean;
    dateLabel: string;
  } | null;
};

/**
 * Compatibility-only copy resolver for quote Workstation overlays.
 * This keeps existing queue wording centralized while query code remains orchestration-only.
 */
export function deriveQuoteWorkstationCopy(
  input: DeriveQuoteWorkstationCopyInput,
): QuoteWorkstationCopy {
  const status = input.openSalesVisit
    ? input.openSalesVisit.isPending
      ? "Site visit requested"
      : "Site visit scheduled"
    : input.openChangeRequest
      ? input.openChangeRequest.hasDraftRevision
        ? input.openChangeRequest.draftRevisionHasLineItems
          ? "Revision ready to send"
          : "Revision draft in progress"
        : "Customer requested changes"
      : input.baseStatus;

  const reason = input.openSalesVisit
    ? input.openSalesVisit.isPending
      ? `Site visit requested for ${input.openSalesVisit.dateLabel}.`
      : `Site visit scheduled for ${input.openSalesVisit.dateLabel}.`
    : input.openChangeRequest
      ? input.openChangeRequest.requiresVisit
        ? "Customer requested changes and follow-up visit may be required."
        : "Customer requested changes on this quote."
      : input.isApprovedQuoteHandoff
        ? "Approved quote is waiting for job setup."
        : input.isCustomerAccepted
          ? "Accepted by customer via portal."
          : input.baseReason;

  const nextStep = input.openSalesVisit
    ? input.openSalesVisit.isPending
      ? "Schedule site visit."
      : "Complete site visit."
    : input.openChangeRequest
      ? input.openChangeRequest.hasDraftRevision
        ? "Continue revision draft."
        : "Create revision draft."
      : input.baseNextStep;

  return { status, reason, nextStep };
}
