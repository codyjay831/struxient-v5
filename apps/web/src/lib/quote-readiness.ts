import {
  type JobStatus,
  type QuoteStatus,
} from "@prisma/client";
import type { StatusBadgeTone } from "@/components/ui/status-badge";

/**
 * Derived readiness story for a Quote, computed from existing Quote + Line Items +
 * Checkpoints + Activation Readiness + Job state.
 *
 * Pure / deterministic — no Prisma access; safe to unit test.
 */
export type QuoteReadinessState =
  | "EMPTY_DRAFT"
  | "DRAFT_IN_PROGRESS"
  | "SENT_AWAITING_CUSTOMER"
  | "APPROVED_NEEDS_EXECUTION_REVIEW"
  | "APPROVED_READY_TO_ACTIVATE"
  | "JOB_ACTIVE"
  | "ARCHIVED";

/**
 * Internal action kinds — mapped to concrete hrefs by the route layer.
 */
export type QuoteReadinessActionKind =
  | "ADD_LINE_ITEM"
  | "ADD_FROM_SCOPE_LIBRARY"
  | "CONTINUE_EDITING"
  | "SEND_QUOTE"
  | "OPEN_PROPOSAL_PREVIEW"
  | "MARK_APPROVED"
  | "OPEN_EXECUTION_REVIEW"
  | "ACTIVATE_JOB"
  | "OPEN_JOB"
  | "RESTORE_TO_DRAFT";

export type QuoteReadinessAction = {
  kind: QuoteReadinessActionKind;
  label: string;
  /** Set when the action targets a specific job. */
  targetJobId?: string;
};

export type QuoteReadinessInput = {
  quote: {
    status: QuoteStatus;
    lineItemCount: number;
    subtotalCents: number;
    totalCents: number;
  };
  job: { id: string; status: JobStatus } | null;
  /**
   * Pass-through of evaluateQuoteJobActivationReadiness result.
   * Only strictly needed for APPROVED quotes to distinguish between review and activation.
   */
  activationReadiness: {
    ready: boolean;
    totalTasksToActivate: number;
    needsAttentionLineCount: number;
    anomalyLineCount: number;
  } | null;
  latestSendAt?: Date | null;
  latestApprovalAt?: Date | null;
  revisionDriftSinceLastProof?: boolean;
};

export type QuoteReadiness = {
  state: QuoteReadinessState;
  /** Short, plain-English headline label. */
  label: string;
  /** One-sentence supporting copy. */
  description: string;
  primaryAction: QuoteReadinessAction | null;
  secondaryAction: QuoteReadinessAction | null;
  /** -1 for terminal states. */
  stepIndex: number;
  totalSteps: number;
  isTerminal: boolean;
  badgeTone: StatusBadgeTone;
  showsRevisionDrift: boolean;
  signals: {
    lineItemCount: number;
    totalCents: number;
    needsExecutionReviewLineCount: number;
    activationTaskCount: number;
    latestSendAt: string | null;
    latestApprovalAt: string | null;
    activatedJobId: string | null;
  };
};

/** Canonical steps: Lines → Sent → Approved → Execution → Job. */
const TOTAL_STEPS = 5;

const STATE_STEP_INDEX: Record<QuoteReadinessState, number> = {
  EMPTY_DRAFT: 0,
  DRAFT_IN_PROGRESS: 0,
  SENT_AWAITING_CUSTOMER: 1,
  APPROVED_NEEDS_EXECUTION_REVIEW: 2,
  APPROVED_READY_TO_ACTIVATE: 3,
  JOB_ACTIVE: 4,
  ARCHIVED: -1,
};

const STATE_TONE: Record<QuoteReadinessState, StatusBadgeTone> = {
  EMPTY_DRAFT: "draft",
  DRAFT_IN_PROGRESS: "draft",
  SENT_AWAITING_CUSTOMER: "sent",
  APPROVED_NEEDS_EXECUTION_REVIEW: "approved",
  APPROVED_READY_TO_ACTIVATE: "approved",
  JOB_ACTIVE: "approved",
  ARCHIVED: "neutral",
};

const STATE_LABEL: Record<QuoteReadinessState, string> = {
  EMPTY_DRAFT: "Empty draft",
  DRAFT_IN_PROGRESS: "Draft in progress",
  SENT_AWAITING_CUSTOMER: "Sent — awaiting customer",
  APPROVED_NEEDS_EXECUTION_REVIEW: "Needs execution review",
  APPROVED_READY_TO_ACTIVATE: "Ready to activate",
  JOB_ACTIVE: "Job active",
  ARCHIVED: "Archived",
};

export const QUOTE_READINESS_STEPS: readonly { key: string; label: string }[] = [
  { key: "lines", label: "Lines" },
  { key: "sent", label: "Sent" },
  { key: "approved", label: "Approved" },
  { key: "execution", label: "Execution" },
  { key: "job", label: "Job" },
] as const;

export function getQuoteReadiness(input: QuoteReadinessInput): QuoteReadiness {
  const { quote, job, activationReadiness } = input;

  if (quote.status === ("ARCHIVED" as QuoteStatus)) {
    return makeTerminal({
      state: "ARCHIVED",
      description: "This quote is archived and read-only. Restore to draft to edit.",
      input,
    });
  }

  if (job && job.status === ("ACTIVE" as JobStatus)) {
    return {
      state: "JOB_ACTIVE",
      label: STATE_LABEL.JOB_ACTIVE,
      description: "A runtime job has been activated from this approved quote.",
      primaryAction: { kind: "OPEN_JOB", label: "Open job", targetJobId: job.id },
      secondaryAction: { kind: "OPEN_EXECUTION_REVIEW", label: "Open execution review" },
      stepIndex: STATE_STEP_INDEX.JOB_ACTIVE,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.JOB_ACTIVE,
      showsRevisionDrift: false,
      signals: mapSignals(input),
    };
  }

  if (quote.status === ("APPROVED" as QuoteStatus)) {
    const isReady = activationReadiness?.ready ?? false;
    const state = isReady ? "APPROVED_READY_TO_ACTIVATE" : "APPROVED_NEEDS_EXECUTION_REVIEW";
    const driftDescription =
      "The quote record changed after the last commercial proof. Restore to draft before changing sold commercial terms.";
    return {
      state,
      label: STATE_LABEL[state],
      description: input.revisionDriftSinceLastProof
        ? driftDescription
        : isReady
          ? "Commercial terms are approved and execution planning is ready. Activate the job to begin work."
          : "Commercial terms are approved. Resolve planning gaps in execution review to activate the job.",
      primaryAction: isReady
        ? { kind: "ACTIVATE_JOB", label: "Activate job" }
        : { kind: "OPEN_EXECUTION_REVIEW", label: "Open execution review" },
      secondaryAction: input.revisionDriftSinceLastProof
        ? { kind: "RESTORE_TO_DRAFT", label: "Restore to draft" }
        : isReady
          ? { kind: "OPEN_EXECUTION_REVIEW", label: "Open execution review" }
          : null,
      stepIndex: STATE_STEP_INDEX[state],
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE[state],
      showsRevisionDrift: Boolean(input.revisionDriftSinceLastProof),
      signals: mapSignals(input),
    };
  }

  if (quote.status === ("SENT" as QuoteStatus)) {
    const driftDescription =
      "The quote record changed after the last commercial proof. Restore to draft to realign scope and send again.";
    return {
      state: "SENT_AWAITING_CUSTOMER",
      label: STATE_LABEL.SENT_AWAITING_CUSTOMER,
      description: input.revisionDriftSinceLastProof
        ? driftDescription
        : "The proposal has been sent to the customer. Waiting on their commercial acceptance.",
      primaryAction: { kind: "MARK_APPROVED", label: "Mark approved" },
      secondaryAction: input.revisionDriftSinceLastProof
        ? { kind: "RESTORE_TO_DRAFT", label: "Restore to draft" }
        : { kind: "OPEN_PROPOSAL_PREVIEW", label: "Open live proposal preview" },
      stepIndex: STATE_STEP_INDEX.SENT_AWAITING_CUSTOMER,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.SENT_AWAITING_CUSTOMER,
      showsRevisionDrift: Boolean(input.revisionDriftSinceLastProof),
      signals: mapSignals(input),
    };
  }

  // DRAFT
  if (quote.lineItemCount === 0) {
    return {
      state: "EMPTY_DRAFT",
      label: STATE_LABEL.EMPTY_DRAFT,
      description:
        "This draft quote has no line items. Add custom scope or copy reusable scope from the Scope Library.",
      primaryAction: { kind: "ADD_LINE_ITEM", label: "Add line item" },
      secondaryAction: {
        kind: "ADD_FROM_SCOPE_LIBRARY",
        label: "Add from Scope Library",
      },
      stepIndex: STATE_STEP_INDEX.EMPTY_DRAFT,
      totalSteps: TOTAL_STEPS,
      isTerminal: false,
      badgeTone: STATE_TONE.EMPTY_DRAFT,
      showsRevisionDrift: false,
      signals: mapSignals(input),
    };
  }

  return {
    state: "DRAFT_IN_PROGRESS",
    label: STATE_LABEL.DRAFT_IN_PROGRESS,
    description: "Lines are saved and totals are computed. Send the quote when commercially ready.",
    primaryAction: { kind: "SEND_QUOTE", label: "Send quote" },
    secondaryAction: { kind: "CONTINUE_EDITING", label: "Continue editing" },
    stepIndex: STATE_STEP_INDEX.DRAFT_IN_PROGRESS,
    totalSteps: TOTAL_STEPS,
    isTerminal: false,
    badgeTone: STATE_TONE.DRAFT_IN_PROGRESS,
    showsRevisionDrift: false,
    signals: mapSignals(input),
  };
}

function makeTerminal(args: {
  state: "ARCHIVED";
  description: string;
  input: QuoteReadinessInput;
}): QuoteReadiness {
  return {
    state: args.state,
    label: STATE_LABEL[args.state],
    description: args.description,
    primaryAction: { kind: "RESTORE_TO_DRAFT", label: "Restore to draft" },
    secondaryAction: null,
    stepIndex: -1,
    totalSteps: TOTAL_STEPS,
    isTerminal: true,
    badgeTone: STATE_TONE[args.state],
    showsRevisionDrift: false,
    signals: mapSignals(args.input),
  };
}

function mapSignals(input: QuoteReadinessInput): QuoteReadiness["signals"] {
  return {
    lineItemCount: input.quote.lineItemCount,
    totalCents: input.quote.totalCents,
    needsExecutionReviewLineCount: input.activationReadiness?.needsAttentionLineCount ?? 0,
    activationTaskCount: input.activationReadiness?.totalTasksToActivate ?? 0,
    latestSendAt: input.latestSendAt?.toISOString() ?? null,
    latestApprovalAt: input.latestApprovalAt?.toISOString() ?? null,
    activatedJobId: input.job?.id ?? null,
  };
}

/**
 * Resolves an action kind to a concrete href.
 */
export function resolveQuoteReadinessActionHref(
  action: QuoteReadinessAction,
  ctx: { quoteId: string },
): string {
  switch (action.kind) {
    case "ADD_LINE_ITEM":
    case "ADD_FROM_SCOPE_LIBRARY":
    case "CONTINUE_EDITING":
      return `/quotes/${ctx.quoteId}#line-items`;
    case "SEND_QUOTE":
    case "MARK_APPROVED":
      return `/quotes/${ctx.quoteId}#commercial-send-acceptance`;
    case "OPEN_PROPOSAL_PREVIEW":
      return `/quotes/${ctx.quoteId}/preview`;
    case "OPEN_EXECUTION_REVIEW":
    case "ACTIVATE_JOB":
      return `/quotes/${ctx.quoteId}/execution-review`;
    case "OPEN_JOB":
      return action.targetJobId ? `/jobs/${action.targetJobId}` : "/jobs";
    case "RESTORE_TO_DRAFT":
      return `/quotes/${ctx.quoteId}#archive-restore`;
  }
}
