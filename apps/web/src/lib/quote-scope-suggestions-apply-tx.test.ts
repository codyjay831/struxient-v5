import assert from "node:assert/strict";
import test from "node:test";
import { QuoteStatus } from "@prisma/client";
import { mapCommercialSuggestionToLineFields } from "@/lib/ai/quote-scope-suggestion-persist";

test("commercial missingInfo is stored as internal observations", () => {
  const fields = mapCommercialSuggestionToLineFields({
    tempId: "c1",
    description: "Panel upgrade",
    lineItemDetails: [
      {
        tempId: "d1",
        content: "Existing Zinsco panel",
        audience: "internal",
      },
    ],
    executionPlanningNotes: [],
    missingInfo: ["Confirm amperage"],
  });

  const notes = fields.internalNotes ?? "";
  assert.match(notes, /Line-specific details:/);
  assert.match(notes, /Zinsco/);
  assert.match(notes, /Quick scope observations \(internal\):/);
  assert.match(notes, /Confirm amperage/);
});

test("Quick Scope observations are modeled as internal notes, not gap records", () => {
  const applySummary = {
    writesCommercialLines: true,
    writesInternalObservations: true,
    writesQuoteScopeDecisions: false,
  };
  assert.equal(applySummary.writesCommercialLines, true);
  assert.equal(applySummary.writesInternalObservations, true);
  assert.equal(applySummary.writesQuoteScopeDecisions, false);
});

test("activation readiness still evaluates from accepted plan tasks only", async () => {
  const { evaluateQuoteJobActivationReadiness } = await import(
    "@/lib/quote-job-activation-readiness"
  );
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    hasApprovalCheckpoint: true,
    executionPlan: {
      status: "ACCEPTED",
      planVersion: 1,
      acceptedPlanningInputHash: "hash-a",
      currentPlanningInputHash: "hash-a",
    },
    lines: [
      {
        id: "line-1",
        description: "Gutters",
        tasks: [
          {
            id: "task-1",
            title: "Install",
            stageId: "stage-1",
            providesSignals: [],
            requiresSignals: [],
            hardSignal: false,
          },
        ],
      },
    ],
    quoteTotalCents: 10000,
    paymentSchedule: [],
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.totalTasksToActivate, 1);
});
