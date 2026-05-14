import type { LeadCommercialProgress } from "@/lib/lead-commercial-progress";
import {
  resolveLeadCommercialProgressActionHref,
} from "@/lib/lead-commercial-progress";
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
      "Execution planning needs review on one or more lines before activation.",
    );
  }

  if (readiness.state === "APPROVED_READY_TO_ACTIVATE") {
    satisfiedItems.push("Execution review is clear enough to activate a job.");
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
  } else if (
    readiness.state === "APPROVED_NEEDS_EXECUTION_REVIEW" ||
    readiness.state === "EMPTY_DRAFT"
  ) {
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
  progress: LeadCommercialProgress;
}): RecordActionState {
  const { leadId, title, subtitle, progress } = input;

  const requiredItems: string[] = [];
  const optionalItems: string[] = [];
  const satisfiedItems: string[] = [];

  if (progress.activeQuote) {
    satisfiedItems.push(
      `Active quote: “${progress.activeQuote.title}” (${progress.activeQuote.status.replaceAll("_", " ")}).`,
    );
  }

  switch (progress.state) {
    case "ADD_CONTACT_INFO":
      if (progress.primaryAction?.kind === "QUALIFY_INTAKE") {
        requiredItems.push(
          "Complete the 4 requirements (Identity, Email, Phone, Address) to start a quote.",
        );
      } else {
        requiredItems.push("Missing required details (Identity, Email, Phone, or Address).");
      }
      break;
    case "NEEDS_CUSTOMER":
      // This state is now mostly bypassed by the single-click promotion, 
      // but kept for back-compat with existing derived states.
      requiredItems.push("Link an existing customer or start a quote to auto-create one.");
      break;
    case "READY_FOR_QUOTE":
      satisfiedItems.push("All 4 requirements met — ready for promotion.");
      requiredItems.push("Start a quote to automatically create the customer and draft.");
      break;
    case "QUOTE_IN_PROGRESS":
      satisfiedItems.push("Customer and draft quote created.");
      requiredItems.push("Finish the draft quote — add lines, totals, and terms.");
      break;
    case "SENT_AWAITING_CUSTOMER":
      satisfiedItems.push("Quote sent — waiting on the customer.");
      break;
    case "APPROVED_READY_TO_ACTIVATE":
      requiredItems.push("Review execution planning and activate the job when ready.");
      break;
    case "JOB_ACTIVE":
      satisfiedItems.push("A job is active from this opportunity.");
      break;
    default:
      break;
  }

  const primary = progress.primaryAction;
  const secondary = progress.secondaryAction;

  let canCompleteInWorkstation = false;
  if (progress.state === "READY_FOR_QUOTE") {
    canCompleteInWorkstation = true;
  }
  if (primary?.kind === "QUALIFY_INTAKE") {
    canCompleteInWorkstation = true;
  }
  const nextAction: NextActionModel | null = primary
    ? {
        type: primary.kind,
        label: primary.label,
        description: progress.description,
        surface:
          primary.kind === "START_QUOTE" ||
          primary.kind === "QUALIFY_INTAKE"
            ? "workstation-inline"
            : "full-record",
        href:
          primary.kind === "START_QUOTE" ||
          primary.kind === "QUALIFY_INTAKE"
            ? undefined
            : resolveLeadCommercialProgressActionHref(primary, { leadId }),
      }
    : null;

  const secondaryActions: NextActionModel[] = [];
  if (secondary) {
    secondaryActions.push({
      type: secondary.kind,
      label: secondary.label,
      description: "Secondary path — usually opens the full record or a related flow.",
      surface: "full-record",
      href: resolveLeadCommercialProgressActionHref(secondary, { leadId }),
    });
  }

  let priority: RecordActionPriority = "actionable";
  if (progress.state === "READY_FOR_QUOTE") {
    priority = "critical";
  } else if (progress.state === "ADD_CONTACT_INFO") {
    priority = "blocking";
  } else if (progress.state === "APPROVED_READY_TO_ACTIVATE") {
    priority = "critical";
  } else if (progress.state === "SENT_AWAITING_CUSTOMER") {
    priority = "watching";
  } else if (progress.state === "JOB_ACTIVE") {
    priority = "satisfied";
  }

  return {
    kind: "lead",
    recordId: leadId,
    title,
    subtitle,
    statusLabel: progress.label,
    priority,
    requiredItems,
    optionalItems,
    satisfiedItems,
    nextAction,
    secondaryActions,
    canCompleteInWorkstation,
    reason: progress.description,
  };
}
