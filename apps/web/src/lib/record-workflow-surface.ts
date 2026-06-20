import type { OpportunityFlowView } from "@/lib/opportunity-flow";
import { resolveOpportunityActionHref } from "@/lib/opportunity-flow";
import type { QuoteReadiness } from "@/lib/quote-readiness";
import { resolveQuoteReadinessActionHref } from "@/lib/quote-readiness";

/**
 * Shared “guided ops” view for Workstation + full-record shells.
 * Derived only — callers pass existing readiness/progress outputs.
 */
export type ActionSurface = "workstation-inline" | "full-record" | "external";

export type NextActionModel = {
  type: string;
  label: string;
  description: string;
  surface: ActionSurface;
  href?: string;
  disabledReason?: string;
};

export type RecordActionPriority =
  | "critical"
  | "blocking"
  | "actionable"
  | "watching"
  | "satisfied";

export type RecordActionState = {
  kind: "lead" | "quote" | "job" | "payment";
  recordId: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  priority: RecordActionPriority;
  requiredItems: string[];
  optionalItems: string[];
  satisfiedItems: string[];
  nextAction: NextActionModel | null;
  secondaryActions: NextActionModel[];
  canCompleteInWorkstation: boolean;
  reason: string;
};

/** Payload embedded on {@link WorkstationWorkItem} — no duplicate title/ids. */
export type WorkItemEmbeddedWorkflow = Pick<
  RecordActionState,
  | "statusLabel"
  | "priority"
  | "requiredItems"
  | "optionalItems"
  | "satisfiedItems"
  | "nextAction"
  | "secondaryActions"
  | "canCompleteInWorkstation"
  | "reason"
>;

export function toEmbeddedWorkflow(
  state: RecordActionState,
): WorkItemEmbeddedWorkflow {
  return {
    statusLabel: state.statusLabel,
    priority: state.priority,
    requiredItems: state.requiredItems,
    optionalItems: state.optionalItems,
    satisfiedItems: state.satisfiedItems,
    nextAction: state.nextAction,
    secondaryActions: state.secondaryActions,
    canCompleteInWorkstation: state.canCompleteInWorkstation,
    reason: state.reason,
  };
}

export function buildQuoteRecordActionState(input: {
  quoteId: string;
  title: string;
  subtitle?: string;
  customerId: string | null;
  leadId: string | null;
  readiness: QuoteReadiness;
}): RecordActionState {
  const { quoteId, title, subtitle, customerId, leadId, readiness } = input;

  const requiredItems: string[] = [];
  const optionalItems: string[] = [];
  const satisfiedItems: string[] = [];

  if (customerId) {
    satisfiedItems.push("Customer is linked to this quote.");
  } else if (leadId) {
    requiredItems.push(
      "Link a customer record — quotes move faster when billing and history share one customer row.",
    );
  } else {
    requiredItems.push(
      "Attach a customer or a lead — this quote is not anchored to a relationship record yet.",
    );
  }

  if (readiness.signals.lineItemCount === 0) {
    requiredItems.push("Add commercial line items before you can price or send.");
  } else {
    satisfiedItems.push(
      `${readiness.signals.lineItemCount} line item${readiness.signals.lineItemCount === 1 ? "" : "s"} on the quote.`,
    );
  }

  if (readiness.state === "DRAFT_IN_PROGRESS") {
    optionalItems.push("Preview the customer proposal when the draft feels complete.");
  }

  if (readiness.state === "SENT_AWAITING_CUSTOMER") {
    satisfiedItems.push("Quote has been sent — waiting on the customer.");
  }

  if (readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW") {
    requiredItems.push(
      "Execution plan needed — add tasks and resolve dependency gaps before activation.",
    );
  }

  if (readiness.state === "APPROVED_READY_TO_ACTIVATE") {
    satisfiedItems.push("Execution plan is ready — you can activate the job.");
  }

  const primary = readiness.primaryAction;
  const secondary = readiness.secondaryAction;

  const primaryWorkstationInline =
    primary?.kind === "SEND_QUOTE" || primary?.kind === "MARK_APPROVED";

  const nextAction: NextActionModel | null = primary
    ? {
        type: primary.kind,
        label: primary.label,
        description: readiness.description,
        surface: primaryWorkstationInline ? "workstation-inline" : "full-record",
        href: primaryWorkstationInline
          ? undefined
          : resolveQuoteReadinessActionHref(primary, { quoteId }),
      }
    : null;

  const secondaryActions: NextActionModel[] = [];
  if (secondary) {
    secondaryActions.push({
      type: secondary.kind,
      label: secondary.label,
      description: "Opens the full quote record.",
      surface: "full-record",
      href: resolveQuoteReadinessActionHref(secondary, { quoteId }),
    });
  }

  let priority: RecordActionPriority = "actionable";
  if (readiness.state === "SENT_AWAITING_CUSTOMER") {
    priority = "watching";
  } else if (!customerId && !leadId) {
    priority = "blocking";
  } else if (readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW") {
    priority = "blocking";
  } else if (readiness.state === "APPROVED_READY_TO_ACTIVATE") {
    priority = "critical";
  }

  return {
    kind: "quote",
    recordId: quoteId,
    title,
    subtitle,
    statusLabel: readiness.label,
    priority,
    requiredItems,
    optionalItems,
    satisfiedItems,
    nextAction,
    secondaryActions,
    canCompleteInWorkstation: Boolean(primaryWorkstationInline),
    reason: readiness.description,
  };
}

export function buildLeadRecordActionState(input: {
  leadId: string;
  title: string;
  subtitle?: string;
  progress: OpportunityFlowView;
}): RecordActionState {
  const { leadId, title, subtitle, progress } = input;

  const requiredItems: string[] = [];
  const optionalItems: string[] = [];
  const satisfiedItems: string[] = [];

  for (const item of progress.satisfiedItems) {
    satisfiedItems.push(`${item} — complete.`);
  }
  for (const item of progress.requirements) {
    requiredItems.push(item);
  }
  for (const fact of progress.keyFacts) {
    optionalItems.push(`${fact.label}: ${fact.value}`);
  }

  const primary = progress.primaryAction;
  const secondary = progress.secondaryActions[0] ?? null;

  const canCompleteInWorkstation = progress.conditionCode === "READY_TO_QUOTE";
  const nextAction: NextActionModel | null = primary
    ? {
        type: primary.kind,
        label: primary.label,
        description: progress.summary,
        surface: "full-record",
        href: resolveOpportunityActionHref(primary, { leadId }),
      }
    : null;

  const secondaryActions: NextActionModel[] = [];
  if (secondary) {
    secondaryActions.push({
      type: secondary.kind,
      label: secondary.label,
      description: "Secondary path — usually opens the full record or a related flow.",
      surface: "full-record",
      href: resolveOpportunityActionHref(secondary, { leadId }),
    });
  }

  let priority: RecordActionPriority = "actionable";
  if (progress.conditionCode === "READY_TO_QUOTE") {
    priority = "critical";
  } else if (progress.conditionCode === "NEEDS_INTAKE_DETAILS") {
    priority = "blocking";
  } else if (progress.conditionCode === "CUSTOMER_MATCH_NEEDS_REVIEW") {
    priority = "blocking";
  } else if (progress.conditionCode === "APPROVED_READY_FOR_JOB") {
    priority = "critical";
  } else if (progress.conditionCode === "WAITING_ON_CUSTOMER") {
    priority = "watching";
  } else if (progress.conditionCode === "JOB_ACTIVE") {
    priority = "satisfied";
  }

  return {
    kind: "lead",
    recordId: leadId,
    title,
    subtitle,
    statusLabel: progress.conditionLabel,
    priority,
    requiredItems,
    optionalItems,
    satisfiedItems,
    nextAction,
    secondaryActions,
    canCompleteInWorkstation,
    reason: progress.summary,
  };
}
