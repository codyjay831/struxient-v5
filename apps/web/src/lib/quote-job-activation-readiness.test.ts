import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteStatus,
} from "@prisma/client";
import {
  evaluateQuoteJobActivationReadiness,
  quoteActivationOnlyBlockedByApproval,
} from "./quote-job-activation-readiness";

const line = (
  overrides: Partial<{
    id: string;
    description: string;
    tasks: { id: string; title: string; providesSignals: string[]; requiresSignals: string[]; hardSignal: boolean }[];
  }> = {},
) => ({
  id: "line-1",
  description: "Rough-in",
  tasks: [
    { id: "task-1", title: "Task 1", providesSignals: [], requiresSignals: [], hardSignal: false }
  ],
  ...overrides,
});

test("evaluateQuoteJobActivationReadiness is ready for approved quote with executable tasks", () => {
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    lines: [line()],
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.totalTasksToActivate, 1);
  assert.equal(readiness.blockReasons.length, 0);
});

test("evaluateQuoteJobActivationReadiness blocks when quote is not approved", () => {
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.SENT,
    lines: [line()],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "QUOTE_NOT_APPROVED");
  assert.equal(quoteActivationOnlyBlockedByApproval(readiness), true);
});

test("evaluateQuoteJobActivationReadiness blocks when hard signal has no provider", () => {
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    lines: [
      line({
        tasks: [
          { id: "task-1", title: "Task 1", providesSignals: [], requiresSignals: ["hard-fact"], hardSignal: true }
        ]
      })
    ],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "HARD_SIGNAL_NO_PROVIDER");
});

test("evaluateQuoteJobActivationReadiness detects circular dependencies", () => {
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    lines: [
      line({
        tasks: [
          { id: "task-1", title: "Task 1", providesSignals: ["signal-a"], requiresSignals: ["signal-b"], hardSignal: false },
          { id: "task-2", title: "Task 2", providesSignals: ["signal-b"], requiresSignals: ["signal-a"], hardSignal: false }
        ]
      })
    ],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "CIRCULAR_SIGNAL_DEPENDENCY");
});
