import { LeadStatus } from "@prisma/client";

export const ISSUED_QUOTE_REVISION_MESSAGE =
  "This opportunity already has a sent or approved quote. Open that quote or create a revision draft from the quote workspace.";

/** Lead status after quote work begins — stays in active sales pipeline until job activation. */
export function leadStatusAfterQuoteWork(current: LeadStatus): LeadStatus {
  if (current === LeadStatus.LOST || current === LeadStatus.ARCHIVED) {
    return current;
  }
  if (current === LeadStatus.ON_HOLD) {
    return LeadStatus.ON_HOLD;
  }
  return LeadStatus.QUALIFIED;
}
