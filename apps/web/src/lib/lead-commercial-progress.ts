import {
  type JobStatus,
  type LeadStatus,
  type QuoteStatus,
} from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

/**
 * Derived commercial progress story for a Lead, computed from existing Lead +
 * related Quote + related Job state. This is intentionally **not** persisted —
 * it is recomputed for display and is independent from the user-set
 * {@link LeadStatus}, which remains a manual lifecycle marker.
 *
 * Pure / deterministic — no Prisma access; safe to unit test.
 */
export type LeadCommercialProgressState =
  | "ADD_CONTACT_INFO"
  | "NEEDS_CUSTOMER"
  | "READY_FOR_QUOTE"
  | "QUOTE_IN_PROGRESS"
  | "SENT_AWAITING_CUSTOMER"
  | "APPROVED_READY_TO_ACTIVATE"
  | "JOB_ACTIVE"
  | "CLOSED_NOT_A_FIT"
  | "ARCHIVED";

/**
 * What the next recommended step is in domain terms — the calling UI maps this
 * to a concrete href so URL knowledge stays in the route layer, not here.
 */
export type LeadCommercialProgressActionKind =
  | "EDIT_CONTACT_INFO"
  | "ATTACH_OR_CREATE_CUSTOMER"
  | "START_QUOTE"
  | "QUALIFY_LEAD"
  | "OPEN_DRAFT_QUOTE"
  | "OPEN_QUOTE"
  | "OPEN_EXECUTION_REVIEW"
  | "OPEN_JOB";

export type LeadCommercialProgressAction = {
  kind: LeadCommercialProgressActionKind;
  label: string;
  /** Set when the action targets a specific quote (open / execution review). */
  targetQuoteId?: string;
  /** Set when the action targets a specific job. */
  targetJobId?: string;
};

/** Slim summary of a lead-linked quote; pass only what's needed to derive progress. */
export type LeadProgressQuoteInput = {
  id: string;
  title: string;
  status: QuoteStatus;
  totalCents: number;
  lineItemCount: number;
  updatedAt: Date;
  job: { id: string; status: JobStatus } | null;
};

export type LeadProgressLeadInput = {
  status: LeadStatus;
  customerId: string | null;
  email: string | null;
  phone: string | null;
};

export type LeadCommercialProgressInput = {
  lead: LeadProgressLeadInput;
  quotes: LeadProgressQuoteInput[];
  /**
   * Pre-computed by the route when the active quote has been edited since the
   * last SEND/APPROVAL checkpoint proof. Optional because the lead list does
   * not pay the extra checkpoint query on every row.
   */
  revisionDriftSinceLastProof?: boolean;
};

export type LeadCommercialProgressActiveQuote = {
  id: string;
  title: string;
  status: QuoteStatus;
  totalCents: number;
  lineItemCount: number;
  updatedAt: Date;
};

export type LeadCommercialProgressActiveJob = {
  id: string;
  status: JobStatus;
};

export type LeadCommercialProgress = {
  state: LeadCommercialProgressState;
  /** Short, plain-English headline label — safe to render directly. */
  label: string;
  /** One-sentence supporting copy explaining the state. */
  description: string;
  /** Primary recommended action; null only for terminal states. */
  primaryAction: LeadCommercialProgressAction | null;
  /**
   * Secondary action when more than one path is sensible — e.g. "Start quote
   * anyway" while the contact/customer guidance is still surfaced as primary.
   */
  secondaryAction: LeadCommercialProgressAction | null;
  activeQuote: LeadCommercialProgressActiveQuote | null;
  activeJob: LeadCommercialProgressActiveJob | null;
  /** -1 for terminal states. */
  stepIndex: number;
  totalSteps: number;
  isTerminal: boolean;
  badgeTone: StatusBadgeTone;
  /** True when the active quote has been edited since its last commercial proof. */
  showsRevisionDrift: boolean;
};

/** Canonical visible step count in the indicator (Setup → Quote → Sent → Approved → Job). */
const TOTAL_STEPS = 5;

const STATE_STEP_INDEX: Record<LeadCommercialProgressState, number> = {
  ADD_CONTACT_INFO: 0,
  NEEDS_CUSTOMER: 0,
  READY_FOR_QUOTE: 0,
  QUOTE_IN_PROGRESS: 1,
  SENT_AWAITING_CUSTOMER: 2,
  APPROVED_READY_TO_ACTIVATE: 3,
  JOB_ACTIVE: 4,
  CLOSED_NOT_A_FIT: -1,
  ARCHIVED: -1,
};

const STATE_TONE: Record<LeadCommercialProgressState, StatusBadgeTone> = {
  ADD_CONTACT_INFO: "draft",
  NEEDS_CUSTOMER: "draft",
  READY_FOR_QUOTE: "sent",
  QUOTE_IN_PROGRESS: "draft",
  SENT_AWAITING_CUSTOMER: "sent",
  APPROVED_READY_TO_ACTIVATE: "approved",
  JOB_ACTIVE: "approved",
  CLOSED_NOT_A_FIT: "neutral",
  ARCHIVED: "neutral",
};

const STATE_LABEL: Record<LeadCommercialProgressState, string> = {
  ADD_CONTACT_INFO: "New lead — add contact info",
  NEEDS_CUSTOMER: "Needs customer",
  READY_FOR_QUOTE: "Ready for quote",
  QUOTE_IN_PROGRESS: "Quote in progress",
  SENT_AWAITING_CUSTOMER: "Sent — awaiting customer",
  APPROVED_READY_TO_ACTIVATE: "Approved — ready for execution",
  JOB_ACTIVE: "Job active",
  CLOSED_NOT_A_FIT: "Closed — not a fit",
  ARCHIVED: "Archived",
};

/** Canonical steps the indicator renders, left-to-right. */
export const LEAD_COMMERCIAL_PROGRESS_STEPS: readonly { key: string; label: string }[] = [
  { key: "setup", label: "Setup" },
  { key: "quote", label: "Quote" },
  { key: "sent", label: "Sent" },
  { key: "approved", label: "Approved" },
  { key: "job", label: "Job" },
] as const;

function pickActiveQuote(
  quotes: LeadProgressQuoteInput[],
): LeadProgressQuoteInput | null {
  let best: LeadProgressQuoteInput | null = null;
  for (const q of quotes) {
    if (q.status === ("ARCHIVED" as QuoteStatus)) {
      continue;
    }
    if (best == null) {
      best = q;
      continue;
    }
    if (q.updatedAt.getTime() > best.updatedAt.getTime()) {
      best = q;
      continue;
    }
    if (
      q.updatedAt.getTime() === best.updatedAt.getTime() &&
      q.id.localeCompare(best.id) < 0
    ) {
      best = q;
    }
  }
  return best;
}

function findAnyActiveJobOwnerQuote(
  quotes: LeadProgressQuoteInput[],
): LeadProgressQuoteInput | null {
  for (const q of quotes) {
    if (q.job && q.job.status === ("ACTIVE" as JobStatus)) {
      return q;
    }
  }
  return null;
}

function toActiveQuote(q: LeadProgressQuoteInput): LeadCommercialProgressActiveQuote {
  return {
    id: q.id,
    title: q.title,
    status: q.status,
    totalCents: q.totalCents,
    lineItemCount: q.lineItemCount,
    updatedAt: q.updatedAt,
  };
}

function describeQuote(q: LeadCommercialProgressActiveQuote, prefix: string): string {
  const lineCount = q.lineItemCount;
  const lineNoun = lineCount === 1 ? "line" : "lines";
  return `${prefix} (${lineCount} ${lineNoun}).`;
}

/**
 * Produce a derived commercial progress story for a Lead.
 *
 * Active quote selection: most recently updated non-ARCHIVED quote (id sort
 * tiebreaker for determinism). If any linked quote (even archived) has an
 * ACTIVE job, the panel surfaces JOB_ACTIVE so a job that outlived an archived
 * quote isn't lost.
 */
export function getLeadCommercialProgress(
  input: LeadCommercialProgressInput,
): LeadCommercialProgress {
  const { lead, quotes } = input;

  if (lead.status === ("ARCHIVED" as LeadStatus)) {
    return makeTerminal({
      state: "ARCHIVED",
      description: "This lead is archived. Restore it from the lead record to continue.",
    });
  }
  if (lead.status === ("LOST" as LeadStatus)) {
    return makeTerminal({
      state: "CLOSED_NOT_A_FIT",
      description: "This opportunity was marked lost. No further commercial action is expected.",
    });
  }

  const jobOwner = findAnyActiveJobOwnerQuote(quotes);
  const mostRecentNonArchived = pickActiveQuote(quotes);

  if (jobOwner && jobOwner.job) {
    const activeQuote = toActiveQuote(jobOwner);
    const activeJob: LeadCommercialProgressActiveJob = {
      id: jobOwner.job.id,
      status: jobOwner.job.status,
    };
    return {
      state: "JOB_ACTIVE",
      label: STATE_LABEL.JOB_ACTIVE,
      description: "A job has been activated from the approved quote.",
      primaryAction: {
        kind: "OPEN_JOB",
        label: "Open job",
        targetJobId: activeJob.id,
      },
      secondaryAction: {
        kind: "OPEN_QUOTE",
        label: "Open quote",
        targetQuoteId: activeQuote.id,
      },
      activeQuote,
      activeJob,
      stepIndex: STATE_STEP_INDEX.JOB_ACTIVE,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.JOB_ACTIVE,
      showsRevisionDrift: false,
    };
  }

  if (mostRecentNonArchived) {
    const activeQuote = toActiveQuote(mostRecentNonArchived);
    const showsDrift = Boolean(input.revisionDriftSinceLastProof);

    if (activeQuote.status === ("APPROVED" as QuoteStatus)) {
      return {
        state: "APPROVED_READY_TO_ACTIVATE",
        label: STATE_LABEL.APPROVED_READY_TO_ACTIVATE,
        description: "The customer has approved this quote. Review execution to activate the job.",
        primaryAction: {
          kind: "OPEN_EXECUTION_REVIEW",
          label: "Open execution review",
          targetQuoteId: activeQuote.id,
        },
        secondaryAction: {
          kind: "OPEN_QUOTE",
          label: "Open quote",
          targetQuoteId: activeQuote.id,
        },
        activeQuote,
        activeJob: null,
        stepIndex: STATE_STEP_INDEX.APPROVED_READY_TO_ACTIVATE,
        totalSteps: TOTAL_STEPS,
        isTerminal: false,
        badgeTone: STATE_TONE.APPROVED_READY_TO_ACTIVATE,
        showsRevisionDrift: showsDrift,
      };
    }

    if (activeQuote.status === ("SENT" as QuoteStatus)) {
      return {
        state: "SENT_AWAITING_CUSTOMER",
        label: STATE_LABEL.SENT_AWAITING_CUSTOMER,
        description: "The quote has been sent. Waiting on the customer's response.",
        primaryAction: {
          kind: "OPEN_QUOTE",
          label: "Open quote",
          targetQuoteId: activeQuote.id,
        },
        secondaryAction: null,
        activeQuote,
        activeJob: null,
        stepIndex: STATE_STEP_INDEX.SENT_AWAITING_CUSTOMER,
        totalSteps: TOTAL_STEPS,
        isTerminal: false,
        badgeTone: STATE_TONE.SENT_AWAITING_CUSTOMER,
        showsRevisionDrift: showsDrift,
      };
    }

    return {
      state: "QUOTE_IN_PROGRESS",
      label: STATE_LABEL.QUOTE_IN_PROGRESS,
      description: describeQuote(activeQuote, "A draft quote is open"),
      primaryAction: {
        kind: "OPEN_DRAFT_QUOTE",
        label: "Open draft quote",
        targetQuoteId: activeQuote.id,
      },
      secondaryAction: null,
      activeQuote,
      activeJob: null,
      stepIndex: STATE_STEP_INDEX.QUOTE_IN_PROGRESS,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.QUOTE_IN_PROGRESS,
      showsRevisionDrift: false,
    };
  }

  if (lead.customerId != null) {
    return {
      state: "READY_FOR_QUOTE",
      label: STATE_LABEL.READY_FOR_QUOTE,
      description: "Customer is linked. Start a quote when you have enough scope to price.",
      primaryAction: { kind: "START_QUOTE", label: "Start quote" },
      secondaryAction: null,
      activeQuote: null,
      activeJob: null,
      stepIndex: STATE_STEP_INDEX.READY_FOR_QUOTE,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.READY_FOR_QUOTE,
      showsRevisionDrift: false,
    };
  }

  const hasContact = Boolean(lead.email) || Boolean(lead.phone);

  if (lead.status === ("OPEN" as LeadStatus)) {
    return {
      state: "ADD_CONTACT_INFO",
      label: "New lead — needs qualification",
      description: hasContact
        ? "Contact info is available. Qualify this lead to move it forward."
        : "Add contact info and qualify this lead to move it forward.",
      primaryAction: { kind: "QUALIFY_LEAD", label: "Mark as qualifying" },
      secondaryAction: hasContact
        ? { kind: "ATTACH_OR_CREATE_CUSTOMER", label: "Attach or create customer" }
        : { kind: "EDIT_CONTACT_INFO", label: "Add contact info" },
      activeQuote: null,
      activeJob: null,
      stepIndex: 0,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: "draft",
      showsRevisionDrift: false,
    };
  }

  if (hasContact) {
    return {
      state: "NEEDS_CUSTOMER",
      label: STATE_LABEL.NEEDS_CUSTOMER,
      description: "This lead has contact info. Attach or create a customer to anchor a quote.",
      primaryAction: {
        kind: "ATTACH_OR_CREATE_CUSTOMER",
        label: "Attach or create customer",
      },
      secondaryAction: { kind: "START_QUOTE", label: "Start quote anyway" },
      activeQuote: null,
      activeJob: null,
      stepIndex: STATE_STEP_INDEX.NEEDS_CUSTOMER,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.NEEDS_CUSTOMER,
      showsRevisionDrift: false,
    };
  }

  return {
    state: "ADD_CONTACT_INFO",
    label: STATE_LABEL.ADD_CONTACT_INFO,
    description: "Add an email or phone so this opportunity can move toward a quote.",
    primaryAction: { kind: "EDIT_CONTACT_INFO", label: "Add contact info" },
    secondaryAction: { kind: "START_QUOTE", label: "Start quote anyway" },
    activeQuote: null,
    activeJob: null,
    stepIndex: STATE_STEP_INDEX.ADD_CONTACT_INFO,
    totalSteps: TOTAL_STEPS,
    isTerminal: false,
    badgeTone: STATE_TONE.ADD_CONTACT_INFO,
    showsRevisionDrift: false,
  };
}

function makeTerminal(args: {
  state: "ARCHIVED" | "CLOSED_NOT_A_FIT";
  description: string;
}): LeadCommercialProgress {
  return {
    state: args.state,
    label: STATE_LABEL[args.state],
    description: args.description,
    primaryAction: null,
    secondaryAction: null,
    activeQuote: null,
    activeJob: null,
    stepIndex: -1,
    totalSteps: TOTAL_STEPS,
    isTerminal: true,
    badgeTone: STATE_TONE[args.state],
    showsRevisionDrift: false,
  };
}

/**
 * Resolves an action kind to a concrete href. Lives next to the helper so the
 * panel and list can share URL conventions without re-implementing them.
 */
export function resolveLeadCommercialProgressActionHref(
  action: LeadCommercialProgressAction,
  ctx: { leadId: string },
): string {
  switch (action.kind) {
    case "EDIT_CONTACT_INFO":
      return `/leads/${ctx.leadId}/edit`;
    case "ATTACH_OR_CREATE_CUSTOMER":
      return `/leads/${ctx.leadId}#customer-link`;
    case "QUALIFY_LEAD":
      return `/leads/${ctx.leadId}`;
    case "START_QUOTE":
      return `/quotes/new?leadId=${encodeURIComponent(ctx.leadId)}`;
    case "OPEN_DRAFT_QUOTE":
    case "OPEN_QUOTE":
      return action.targetQuoteId ? `/quotes/${action.targetQuoteId}` : "/quotes";
    case "OPEN_EXECUTION_REVIEW":
      return action.targetQuoteId
        ? `/quotes/${action.targetQuoteId}/execution-review`
        : "/quotes";
    case "OPEN_JOB":
      return action.targetJobId ? `/jobs/${action.targetJobId}` : "/jobs";
  }
}
