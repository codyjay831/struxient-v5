import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionStatus,
  JobStatus,
  QuoteStatus,
} from "@prisma/client";
import { getQuoteWorkflowPresentation } from "./quote-workflow-presenter";
import { evaluateQuoteSendReadiness } from "@/lib/quote/quote-send-readiness";
import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";

const baseInput = {
  quote: {
    status: QuoteStatus.DRAFT,
    lineItemCount: 2,
    subtotalCents: 10_000,
    totalCents: 10_000,
    jobsiteMissing: false,
  },
  job: null as { id: string; status: JobStatus } | null,
  activationReadiness: {
    ready: false,
    totalTasksToActivate: 0,
    blockReasons: [],
  },
  isCommercialEditable: true,
  paymentScheduleItemCount: 2,
  scopeDecisions: [] as QuoteScopeDecisionPayload[],
  activityItems: [],
};

function scopeDecision(
  overrides: Partial<QuoteScopeDecisionPayload> & Pick<QuoteScopeDecisionPayload, "id">,
): QuoteScopeDecisionPayload {
  return {
    quoteId: "quote-1",
    quoteLineItemId: null,
    sourceType: "QUICK_SCOPE",
    title: "Example gap",
    detail: null,
    status: QuoteScopeDecisionStatus.OPEN,
    resolutionTiming: null,
    quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
    ...overrides,
  };
}

test("getQuoteWorkflowPresentation: draft blocked by missing scope, site, and payment", () => {
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    quote: {
      ...baseInput.quote,
      lineItemCount: 0,
      jobsiteMissing: true,
    },
    paymentScheduleItemCount: 0,
  });

  assert.equal(presentation.workflowState, "BLOCKED_FROM_SEND");
  assert.ok(presentation.blockers.length >= 3);
  assert.equal(presentation.canSend, false);
  assert.match(presentation.primaryMessage, /before sending/i);
});

test("getQuoteWorkflowPresentation: ready to send", () => {
  const presentation = getQuoteWorkflowPresentation(baseInput);

  assert.equal(presentation.workflowState, "READY_TO_SEND");
  assert.equal(presentation.canSend, true);
  assert.equal(presentation.primaryAction?.kind, "SEND_QUOTE");
  assert.equal(presentation.isCommercialLocked, false);
});

test("getQuoteWorkflowPresentation: OPEN scope gap blocks send and matches server readiness", () => {
  const scopeDecisions = [
    scopeDecision({
      id: "gap-1",
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
      title: "Square footage",
    }),
  ];
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    scopeDecisions,
  });

  const server = evaluateQuoteSendReadiness({
    status: QuoteStatus.DRAFT,
    lineItemCount: 2,
    serviceLocationId: "loc-1",
    paymentScheduleItemCount: 2,
    scopeDecisions,
  });

  assert.equal(presentation.workflowState, "BLOCKED_FROM_SEND");
  assert.equal(presentation.canSend, false);
  assert.equal(server.ok, false);
  assert.ok(presentation.blockers.some((b) => /Clarify scope/i.test(b.message)));
});

test("getQuoteWorkflowPresentation: legacy OPEN NONE scope gap blocks send", () => {
  const scopeDecisions = [
    scopeDecision({
      id: "legacy-1",
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      title: "Schedule preference",
    }),
  ];
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    scopeDecisions,
  });

  assert.equal(presentation.canSend, false);
  assert.equal(
    evaluateQuoteSendReadiness({
      status: QuoteStatus.DRAFT,
      lineItemCount: 2,
      serviceLocationId: "loc-1",
      paymentScheduleItemCount: 2,
      scopeDecisions,
    }).ok,
    false,
  );
});

test("getQuoteWorkflowPresentation: DEFERRED scope gap does not block send", () => {
  const scopeDecisions = [
    scopeDecision({
      id: "def-1",
      status: QuoteScopeDecisionStatus.DEFERRED,
      quoteImpact: QuoteScopeDecisionQuoteImpact.NONE,
      title: "Crew assignment",
    }),
  ];
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    scopeDecisions,
  });

  assert.equal(presentation.workflowState, "READY_TO_SEND");
  assert.equal(presentation.canSend, true);
  assert.equal(presentation.blockers.length, 0);
  assert.ok(presentation.sendWarnings.length > 0);
  assert.equal(
    evaluateQuoteSendReadiness({
      status: QuoteStatus.DRAFT,
      lineItemCount: 2,
      serviceLocationId: "loc-1",
      paymentScheduleItemCount: 2,
      scopeDecisions,
    }).ok,
    true,
  );
});

test("getQuoteWorkflowPresentation: sent pending approval", () => {
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    quote: { ...baseInput.quote, status: QuoteStatus.SENT },
    isCommercialEditable: false,
    latestSendAt: new Date("2026-06-01"),
  });

  assert.equal(presentation.workflowState, "SENT_PENDING_APPROVAL");
  assert.equal(presentation.canApprove, true);
  assert.equal(presentation.primaryAction?.kind, "MARK_APPROVED");
  assert.equal(presentation.isCommercialLocked, true);
});

test("getQuoteWorkflowPresentation: approved with no execution plan", () => {
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    quote: { ...baseInput.quote, status: QuoteStatus.APPROVED },
    isCommercialEditable: false,
    activationReadiness: {
      ready: false,
      totalTasksToActivate: 0,
      blockReasons: [
        {
          code: "NO_EXECUTION_TASKS",
          message: "No execution tasks to activate—add at least one task before activation.",
        },
      ],
    },
    latestApprovalAt: new Date("2026-06-02"),
  });

  assert.equal(presentation.workflowState, "APPROVED_EXECUTION_NEEDED");
  assert.equal(presentation.primaryHeadline, "Execution plan needed");
  assert.equal(presentation.canBuildExecutionPlan, true);
  assert.match(presentation.primaryMessage, /no work plan exists yet/i);
});

test("getQuoteWorkflowPresentation: approved with execution plan ready", () => {
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    quote: { ...baseInput.quote, status: QuoteStatus.APPROVED },
    isCommercialEditable: false,
    activationReadiness: {
      ready: true,
      totalTasksToActivate: 5,
      blockReasons: [],
    },
    latestApprovalAt: new Date("2026-06-02"),
  });

  assert.equal(presentation.workflowState, "READY_FOR_JOB_ACTIVATION");
  assert.equal(presentation.canActivateJob, true);
  assert.equal(presentation.primaryAction?.kind, "ACTIVATE_JOB");
});

test("getQuoteWorkflowPresentation: job activated", () => {
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    quote: { ...baseInput.quote, status: QuoteStatus.APPROVED },
    isCommercialEditable: false,
    job: { id: "job-1", status: JobStatus.ACTIVE },
    activationReadiness: {
      ready: true,
      totalTasksToActivate: 5,
      blockReasons: [],
    },
  });

  assert.equal(presentation.workflowState, "JOB_ACTIVATED");
  assert.equal(presentation.primaryAction?.kind, "OPEN_JOB");
});

test("getQuoteWorkflowPresentation: exposes at most one primary action", () => {
  const states = [
    getQuoteWorkflowPresentation(baseInput),
    getQuoteWorkflowPresentation({
      ...baseInput,
      quote: { ...baseInput.quote, status: QuoteStatus.SENT },
      isCommercialEditable: false,
    }),
    getQuoteWorkflowPresentation({
      ...baseInput,
      quote: { ...baseInput.quote, status: QuoteStatus.APPROVED },
      isCommercialEditable: false,
      activationReadiness: { ready: true, totalTasksToActivate: 3, blockReasons: [] },
    }),
  ];

  for (const p of states) {
    const primaryCount = p.primaryAction ? 1 : 0;
    assert.ok(primaryCount <= 1);
  }
});

test("getQuoteWorkflowPresentation: canSend matches evaluateQuoteSendReadiness for draft quotes", () => {
  const scopeDecisions = [
    scopeDecision({ id: "open-1" }),
    scopeDecision({
      id: "def-1",
      status: QuoteScopeDecisionStatus.DEFERRED,
    }),
  ];
  const presentation = getQuoteWorkflowPresentation({
    ...baseInput,
    scopeDecisions,
  });
  const readiness = evaluateQuoteSendReadiness({
    status: QuoteStatus.DRAFT,
    lineItemCount: 2,
    serviceLocationId: "jobsite",
    paymentScheduleItemCount: 2,
    scopeDecisions,
  });
  assert.equal(presentation.canSend, readiness.ok);
});
