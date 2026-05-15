/**
 * Workstation "Investigate" lane — derived/preview signals for things that look
 * unclear, risky, or missing context and need human review before becoming tasks.
 *
 * No persistence layer, no Prisma model, no separate workflow engine. Signals
 * are either derived from the small slice of org data Workstation already reads
 * (currently lead-linkage counts) or shown as clearly-labelled previews of
 * categories the lane will surface once detection is wired.
 */

export type WorkstationInvestigateRecordType =
  | "lead"
  | "quote"
  | "job"
  | "customer"
  | "payment"
  | "activity";

export type WorkstationInvestigateSeverity = "low" | "medium" | "high";

export type WorkstationInvestigateOrigin = "derived" | "preview";

export type WorkstationInvestigateSignal = {
  id: string;
  recordType: WorkstationInvestigateRecordType;
  title: string;
  recordLabel: string;
  reason: string;
  suggestedAction: string;
  severity: WorkstationInvestigateSeverity;
  href: string;
  primaryActionLabel: string;
  secondaryHref?: string;
  secondaryActionLabel?: string;
  /** "derived" = computed from real org data; "preview" = illustrative example. */
  origin: WorkstationInvestigateOrigin;
};

const SEVERITY_RANK: Record<WorkstationInvestigateSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** High → low, then derived before preview, then alphabetical for stability. */
export function sortWorkstationInvestigateSignals(
  signals: readonly WorkstationInvestigateSignal[],
): WorkstationInvestigateSignal[] {
  return [...signals].sort((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    if (a.origin !== b.origin) return a.origin === "derived" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Static preview signals — illustrate the shape of the lane when only a tiny
 * slice of real data is available. Marked `origin: "preview"` so the UI can
 * label them honestly. Adjust copy as new detection lands; do not promote any
 * of these to "derived" until the underlying data exists.
 */
export const WORKSTATION_INVESTIGATE_PREVIEW_SIGNALS: readonly WorkstationInvestigateSignal[] = [
  {
    id: "preview-duplicate-customer",
    recordType: "customer",
    title: "Possible duplicate customer",
    recordLabel: "Customer — match needs review",
    reason:
      "Email or phone may match an existing customer. Duplicate detection is not wired yet.",
    suggestedAction: "Compare matches before creating a new customer.",
    severity: "medium",
    href: "/customers",
    primaryActionLabel: "Open customers",
    origin: "preview",
  },
  {
    id: "preview-quote-readiness",
    recordType: "quote",
    title: "Quote readiness issue",
    recordLabel: "Quote — preparation may be incomplete",
    reason:
      "A quote may be missing pricing, scope, or terms before send. Cross-quote readiness scanning is not wired yet.",
    suggestedAction: "Open the quote and resolve the readiness gap.",
    severity: "medium",
    href: "/leads",
    primaryActionLabel: "Review Sales",
    origin: "preview",
  },
  {
    id: "preview-payment-hold",
    recordType: "payment",
    title: "Payment hold may need review",
    recordLabel: "Payment — reserved",
    reason:
      "A payment could be held or unmatched. The payments surface is reserved—no detection runs yet.",
    suggestedAction: "Inspect the payments shell when records exist.",
    severity: "low",
    href: "/payments",
    primaryActionLabel: "Open payments (reserved)",
    origin: "preview",
  },
  {
    id: "preview-activity-followup",
    recordType: "activity",
    title: "Customer reply may need action",
    recordLabel: "Activity — recent message",
    reason:
      "A customer message may mention rescheduling, access, or a question. Activity parsing is not wired yet.",
    suggestedAction: "Open the related opportunity or job and confirm a follow-up step.",
    severity: "low",
    href: "/leads",
    primaryActionLabel: "Open Sales",
    secondaryHref: "/jobs",
    secondaryActionLabel: "Open jobs",
    origin: "preview",
  },
];

export type WorkstationInvestigateDerivedInputs = {
  /** Org-scoped count of opportunities with `customerId === null`. */
  unlinkedLeads: number;
};

/**
 * Builds the live Investigate signals from the small slice of real data
 * Workstation already reads. Today only opportunity-customer linkage is available;
 * extend this as more derivation is added.
 */
export function buildWorkstationInvestigateDerivedSignals(
  inputs: WorkstationInvestigateDerivedInputs,
): WorkstationInvestigateSignal[] {
  const signals: WorkstationInvestigateSignal[] = [];

  if (inputs.unlinkedLeads > 0) {
    const isOne = inputs.unlinkedLeads === 1;
    signals.push({
      id: "derived-unlinked-leads",
      recordType: "lead",
      title: isOne
        ? "Opportunity needs customer match"
        : `${inputs.unlinkedLeads} opportunities need customer match`,
      recordLabel: isOne ? "Opportunity — no linked customer" : "Opportunities — no linked customer",
      reason: isOne
        ? "An opportunity has no linked customer. The contact may already exist."
        : `${inputs.unlinkedLeads} opportunities have no linked customer. The contacts may already exist.`,
      suggestedAction:
        "Open the opportunity and link, create, or confirm the customer before acting on it.",
      severity: "medium",
      href: "/leads",
      primaryActionLabel: isOne ? "Review unlinked opportunity" : "Review unlinked opportunities",
      secondaryHref: "/customers",
      secondaryActionLabel: "Open customers",
      origin: "derived",
    });
  }

  return signals;
}
