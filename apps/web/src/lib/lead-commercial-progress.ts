import { LeadStatus, type JobStatus, type QuoteStatus } from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";
import { evaluateLeadReadiness } from "./lead-readiness-heuristics";

/**
 * @deprecated Prefer `getOpportunityFlow` from `@/lib/opportunity-flow`.
 * Legacy commercial progress helper — retained for handoff tests only.
 *
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
  | "FOLLOW_UP_LATER"
  | "READY_FOR_QUOTE"
  | "QUOTE_IN_PROGRESS"
  | "SENT_AWAITING_CUSTOMER"
  | "APPROVED_READY_TO_ACTIVATE"
  | "JOB_ACTIVE"
  | "CONFLICT_WITH_EXISTING_CUSTOMER"
  | "CLOSED_NOT_A_FIT"
  | "ARCHIVED";

/**
 * What the next recommended step is in domain terms — the calling UI maps this
 * to a concrete href so URL knowledge stays in the route layer, not here.
 */
export type LeadCommercialProgressActionKind =
  | "EDIT_CONTACT_INFO"
  | "ATTACH_OR_CREATE_CUSTOMER"
  | "RESOLVE_CUSTOMER_CONFLICT"
  | "START_QUOTE"
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

export type LeadProgressInput = {
  status: LeadStatus;
  followUpAt?: Date | null;
  customerId: string | null;
  contactName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  jobsiteAddressLine: string | null;
  isAddressVerified?: boolean;
};

export type LeadCommercialProgressInput = {
  lead: LeadProgressInput;
  quotes: LeadProgressQuoteInput[];
  /**
   * Pre-computed by the route when a matching customer is found.
   * Blocks auto-promotion to prevent duplicates.
   */
  hasExistingCustomerMatch?: boolean;
  /**
   * Pre-computed by the route when the active quote has been edited since the
   * last SEND/APPROVAL checkpoint proof. Optional because the list does
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

export type LeadWorkSurfaceProgressAction = {
  href: string;
  label: string;
  /** OPEN_DRAFT_QUOTE / OPEN_QUOTE / START_QUOTE → switch to Quote tab. */
  opensQuoteTab: boolean;
  /** ATTACH_OR_CREATE_CUSTOMER / EDIT_CONTACT_INFO → switch to Contact tab. */
  opensContactTab: boolean;
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
  /** Items that have met the "smart" validation criteria. */
  satisfiedItems: string[];
  /** Items required for promotion. */
  requiredItems: string[];
};

/** Canonical visible step count in the indicator (Setup → Quote → Sent → Approved → Job). */
const TOTAL_STEPS = 5;

const STATE_STEP_INDEX: Record<LeadCommercialProgressState, number> = {
  ADD_CONTACT_INFO: 0,
  NEEDS_CUSTOMER: 0,
  FOLLOW_UP_LATER: 0,
  READY_FOR_QUOTE: 0,
  QUOTE_IN_PROGRESS: 1,
  SENT_AWAITING_CUSTOMER: 2,
  APPROVED_READY_TO_ACTIVATE: 3,
  JOB_ACTIVE: 4,
  CONFLICT_WITH_EXISTING_CUSTOMER: 0,
  CLOSED_NOT_A_FIT: -1,
  ARCHIVED: -1,
};

const STATE_TONE: Record<LeadCommercialProgressState, StatusBadgeTone> = {
  ADD_CONTACT_INFO: "draft",
  NEEDS_CUSTOMER: "draft",
  FOLLOW_UP_LATER: "warning",
  READY_FOR_QUOTE: "sent",
  QUOTE_IN_PROGRESS: "draft",
  SENT_AWAITING_CUSTOMER: "sent",
  APPROVED_READY_TO_ACTIVATE: "approved",
  JOB_ACTIVE: "approved",
  CONFLICT_WITH_EXISTING_CUSTOMER: "warning",
  CLOSED_NOT_A_FIT: "neutral",
  ARCHIVED: "neutral",
};

const STATE_LABEL: Record<LeadCommercialProgressState, string> = {
  ADD_CONTACT_INFO: "Needs request details",
  NEEDS_CUSTOMER: "Needs customer record",
  FOLLOW_UP_LATER: "On hold — follow up",
  READY_FOR_QUOTE: "Ready to build quote",
  QUOTE_IN_PROGRESS: "Quote draft in progress",
  SENT_AWAITING_CUSTOMER: "Sent — awaiting customer",
  APPROVED_READY_TO_ACTIVATE: "Approved — ready to schedule",
  JOB_ACTIVE: "Awarded",
  CONFLICT_WITH_EXISTING_CUSTOMER: "Customer match needs review",
  CLOSED_NOT_A_FIT: "Closed — lost",
  ARCHIVED: "Archived",
};

/** Canonical steps the indicator renders, left-to-right. */
export const LEAD_COMMERCIAL_PROGRESS_STEPS: readonly { key: string; label: string }[] = [
  { key: "setup", label: "Intake" },
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
  const { lead, quotes, hasExistingCustomerMatch } = input;

  if (lead.status === ("ARCHIVED" as LeadStatus)) {
    return makeTerminal({
      state: "ARCHIVED",
      description: "This intake is archived. Restore it from the record to continue.",
    });
  }
  if (lead.status === ("LOST" as LeadStatus)) {
    return makeTerminal({
      state: "CLOSED_NOT_A_FIT",
      description: "This opportunity was marked lost. No further commercial action is expected.",
    });
  }
  if (lead.status === ("ON_HOLD" as LeadStatus)) {
    const followUpDate = lead.followUpAt
      ? lead.followUpAt.toLocaleDateString()
      : null;
    return {
      state: "FOLLOW_UP_LATER",
      label: STATE_LABEL.FOLLOW_UP_LATER,
      description: followUpDate
        ? `Follow up on ${followUpDate} to reopen this opportunity.`
        : "This opportunity is paused. Follow up later when timing is right.",
      primaryAction: null,
      secondaryAction: null,
      activeQuote: null,
      activeJob: null,
      stepIndex: STATE_STEP_INDEX.FOLLOW_UP_LATER,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.FOLLOW_UP_LATER,
      showsRevisionDrift: false,
      satisfiedItems: [],
      requiredItems: [],
    };
  }

  // Evaluate readiness using smart heuristics
  const report = evaluateLeadReadiness({
    contactName: lead.contactName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
    address: lead.jobsiteAddressLine,
    isAddressVerified: lead.isAddressVerified,
  });

  const satisfiedItems: string[] = [];
  if (report.hasIdentity) satisfiedItems.push("Identity");
  if (report.hasEmail) satisfiedItems.push("Email");
  if (report.hasPhone) satisfiedItems.push("Phone");
  if (report.hasAddress) satisfiedItems.push("Location");

  const requiredItems = ["Identity", "Email", "Phone", "Location"];
  const isReadyForPromotion = report.isReady;

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
      description: "Sold work is on the job board.",
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
      satisfiedItems,
      requiredItems,
    };
  }

  if (mostRecentNonArchived) {
    const activeQuote = toActiveQuote(mostRecentNonArchived);
    const showsDrift = Boolean(input.revisionDriftSinceLastProof);

    if (activeQuote.status === ("APPROVED" as QuoteStatus)) {
      return {
        state: "APPROVED_READY_TO_ACTIVATE",
        label: STATE_LABEL.APPROVED_READY_TO_ACTIVATE,
        description: "The customer approved this quote. Build the execution plan, then activate the job.",
        primaryAction: {
          kind: "OPEN_EXECUTION_REVIEW",
          label: "Build execution plan",
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
        satisfiedItems,
        requiredItems,
      };
    }

    if (activeQuote.status === ("SENT" as QuoteStatus)) {
      return {
        state: "SENT_AWAITING_CUSTOMER",
        label: STATE_LABEL.SENT_AWAITING_CUSTOMER,
        description: "Quote sent. Waiting for customer approval.",
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
        satisfiedItems,
        requiredItems,
      };
    }

    return {
      state: "QUOTE_IN_PROGRESS",
      label: STATE_LABEL.QUOTE_IN_PROGRESS,
      description: describeQuote(activeQuote, "A draft quote is open"),
      primaryAction: {
        kind: "OPEN_DRAFT_QUOTE",
        label: "Continue quote",
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
      satisfiedItems,
      requiredItems,
    };
  }

  if (lead.customerId != null || isReadyForPromotion) {
    if (!lead.customerId && hasExistingCustomerMatch) {
      return {
        state: "CONFLICT_WITH_EXISTING_CUSTOMER",
        label: STATE_LABEL.CONFLICT_WITH_EXISTING_CUSTOMER,
        description: "A customer with matching contact info already exists. Review the match before building a quote.",
        primaryAction: {
          kind: "RESOLVE_CUSTOMER_CONFLICT",
          label: "Review customer match",
        },
        secondaryAction: null,
        activeQuote: null,
        activeJob: null,
        stepIndex: STATE_STEP_INDEX.READY_FOR_QUOTE,
        totalSteps: TOTAL_STEPS,
        isTerminal: false,
        badgeTone: STATE_TONE.CONFLICT_WITH_EXISTING_CUSTOMER,
        showsRevisionDrift: false,
        satisfiedItems,
        requiredItems,
      };
    }

    return {
      state: "READY_FOR_QUOTE",
      label: STATE_LABEL.READY_FOR_QUOTE,
      description: lead.customerId
        ? "Customer is linked. Build a quote when you have enough scope to price."
        : "Request details are qualified. Build a quote to create the customer and draft together.",
      primaryAction: { kind: "START_QUOTE", label: "Build quote" },
      secondaryAction: null,
      activeQuote: null,
      activeJob: null,
      stepIndex: STATE_STEP_INDEX.READY_FOR_QUOTE,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.READY_FOR_QUOTE,
      showsRevisionDrift: false,
      satisfiedItems,
      requiredItems,
    };
  }

  if (lead.status === LeadStatus.NEW) {
    return {
      state: "ADD_CONTACT_INFO",
      label: "New intake — review details",
      description: "Review the intake details and complete the 4 requirements to start a quote.",
      primaryAction: { kind: "EDIT_CONTACT_INFO", label: "Fix missing info" },
      secondaryAction: null,
      activeQuote: null,
      activeJob: null,
      stepIndex: 0,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: "draft",
      showsRevisionDrift: false,
      satisfiedItems,
      requiredItems,
    };
  }

  return {
    state: "ADD_CONTACT_INFO",
    label: STATE_LABEL.ADD_CONTACT_INFO,
    description: "Complete the identity, contact, and location details to move toward a quote.",
    primaryAction: { kind: "EDIT_CONTACT_INFO", label: "Fix missing info" },
    secondaryAction: null,
    activeQuote: null,
    activeJob: null,
    stepIndex: STATE_STEP_INDEX.ADD_CONTACT_INFO,
    totalSteps: TOTAL_STEPS,
    isTerminal: false,
    badgeTone: STATE_TONE.ADD_CONTACT_INFO,
    showsRevisionDrift: false,
    satisfiedItems,
    requiredItems,
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
    satisfiedItems: [],
    requiredItems: [],
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
    case "RESOLVE_CUSTOMER_CONFLICT":
      return `/leads/${ctx.leadId}#customer-link`;
    case "START_QUOTE":
      // Keep lead-origin quote starts on the lead surface UX.
      return `/leads/${ctx.leadId}`;
    case "OPEN_DRAFT_QUOTE":
    case "OPEN_QUOTE":
      return action.targetQuoteId ? `/quotes/${action.targetQuoteId}` : "/leads";
    case "OPEN_EXECUTION_REVIEW":
      return action.targetQuoteId
        ? `/quotes/${action.targetQuoteId}/execution-review`
        : "/leads";
    case "OPEN_JOB":
      return action.targetJobId ? `/jobs/${action.targetJobId}` : "/jobs";
  }
}

/**
 * Helper for server containers to convert a `LeadCommercialProgressAction`
 * into the serialized shape this surface expects (href + tab-switch flags).
 */
export function serializeLeadProgressAction(
  action: LeadCommercialProgressAction | null,
  ctx: { leadId: string },
): LeadWorkSurfaceProgressAction | null {
  if (!action) return null;
  const href = resolveLeadCommercialProgressActionHref(action, ctx);
  const opensQuoteTab =
    action.kind === "OPEN_DRAFT_QUOTE" ||
    action.kind === "OPEN_QUOTE" ||
    action.kind === "START_QUOTE";
  const opensContactTab =
    action.kind === "ATTACH_OR_CREATE_CUSTOMER" ||
    action.kind === "RESOLVE_CUSTOMER_CONFLICT" ||
    action.kind === "EDIT_CONTACT_INFO";
  return { href, label: action.label, opensQuoteTab, opensContactTab };
}
