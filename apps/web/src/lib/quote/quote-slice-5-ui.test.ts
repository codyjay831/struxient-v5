import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteScopeDecisionQuoteImpact,
  QuoteScopeDecisionStatus,
  QuoteStatus,
} from "@prisma/client";
import { buildQuoteLineExecutionPlanningSummaryLine } from "@/lib/quote-line-execution-planning-display";
import { lineClarifyActionLabel } from "@/lib/quote/quote-clarify-scope-ui";
import {
  QUOTE_DRAFT_EXECUTION_ACTION_LABEL,
  QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY,
  QUOTE_DRAFT_EXECUTION_INTERNAL_COPY,
  quoteDraftExecutionActionLabel,
  quoteDraftExecutionDefaultExpanded,
} from "@/lib/quote/quote-draft-execution-ui";
import { evaluateQuoteSendReadiness } from "@/lib/quote/quote-send-readiness";
import { getQuoteWorkflowPresentation } from "@/lib/quote-workflow-presenter";
import type { QuoteScopeDecisionPayload } from "@/lib/quote-scope-decision-types";

test("Slice 5: Clarify remains the primary scope action label when gaps exist", () => {
  assert.equal(lineClarifyActionLabel(2), "Clarify (2)");
  assert.equal(lineClarifyActionLabel(0), "Clarify scope");
  assert.notEqual(lineClarifyActionLabel(1), QUOTE_DRAFT_EXECUTION_ACTION_LABEL);
});

test("Slice 5: draft execution action uses internal Plan work label", () => {
  assert.equal(quoteDraftExecutionActionLabel(), "Plan work (internal)");
  assert.equal(QUOTE_DRAFT_EXECUTION_ACTION_LABEL, "Plan work (internal)");
});

test("Slice 5: draft execution section is collapsed by default", () => {
  assert.equal(quoteDraftExecutionDefaultExpanded(false), false);
  assert.equal(quoteDraftExecutionDefaultExpanded(true), true);
});

test("Slice 5: internal-only copy constants are present for expanded panel", () => {
  assert.match(QUOTE_DRAFT_EXECUTION_INTERNAL_COPY, /internal planning only/i);
  assert.match(QUOTE_DRAFT_EXECUTION_INTERNAL_COPY, /not shown on the customer quote/i);
  assert.match(QUOTE_DRAFT_EXECUTION_CONFIRMED_LATER_COPY, /execution setup/i);
});

test("Slice 5: zero-task planning summary uses internal wording", () => {
  const line = buildQuoteLineExecutionPlanningSummaryLine({
    taskCount: 0,
    executionSummaryLine: null,
  });
  assert.equal(line, "No draft tasks yet");
  assert.doesNotMatch(line, /execution plan needed/i);
});

test("Slice 5: existing draft execution data remains describable when tasks exist", () => {
  const line = buildQuoteLineExecutionPlanningSummaryLine({
    taskCount: 2,
    executionSummaryLine: "Rough-in, trim",
  });
  assert.match(line, /Planned work/);
  assert.match(line, /Rough-in, trim/);
});

test("Slice 5: draft execution does not affect canSend", () => {
  const scopeDecisions: QuoteScopeDecisionPayload[] = [];
  const presentation = getQuoteWorkflowPresentation({
    quote: {
      status: QuoteStatus.DRAFT,
      lineItemCount: 1,
      subtotalCents: 5000,
      totalCents: 5000,
      jobsiteMissing: false,
    },
    job: null,
    activationReadiness: { ready: false, totalTasksToActivate: 0, blockReasons: [] },
    isCommercialEditable: true,
    paymentScheduleItemCount: 1,
    scopeDecisions,
    activityItems: [],
  });
  const readiness = evaluateQuoteSendReadiness({
    status: QuoteStatus.DRAFT,
    lineItemCount: 1,
    serviceLocationId: "jobsite-1",
    paymentScheduleItemCount: 1,
    scopeDecisions,
  });
  assert.equal(presentation.canSend, readiness.ok);
});

test("Slice 5: required commercial gaps still route to Clarify not draft execution", () => {
  const scopeDecisions: QuoteScopeDecisionPayload[] = [
    {
      id: "gap-1",
      quoteId: "quote-1",
      quoteLineItemId: "line-a",
      sourceType: "QUICK_SCOPE",
      title: "Panel amperage",
      detail: null,
      status: QuoteScopeDecisionStatus.OPEN,
      resolutionTiming: null,
      quoteImpact: QuoteScopeDecisionQuoteImpact.REQUIRED,
    },
  ];
  const presentation = getQuoteWorkflowPresentation({
    quote: {
      status: QuoteStatus.DRAFT,
      lineItemCount: 1,
      subtotalCents: 5000,
      totalCents: 5000,
      jobsiteMissing: false,
    },
    job: null,
    activationReadiness: { ready: false, totalTasksToActivate: 0, blockReasons: [] },
    isCommercialEditable: true,
    paymentScheduleItemCount: 1,
    scopeDecisions,
    activityItems: [],
  });
  assert.equal(presentation.canSend, false);
  assert.ok(presentation.blockers.some((b) => /clarify scope/i.test(b.message)));
  assert.ok(
    presentation.blockers.every((b) => b.actionLabel !== QUOTE_DRAFT_EXECUTION_ACTION_LABEL),
  );
});
