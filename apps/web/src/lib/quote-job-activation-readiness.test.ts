import assert from "node:assert/strict";
import test from "node:test";
import {
  QuoteLineExecutionMergeMode,
  QuoteLineExecutionReviewStatus,
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
    executionReviewStatus: QuoteLineExecutionReviewStatus;
    executionMergeMode: QuoteLineExecutionMergeMode;
    taskCount: number;
  }> = {},
) => ({
  id: "line-1",
  description: "Rough-in",
  executionReviewStatus: QuoteLineExecutionReviewStatus.UNREVIEWED,
  executionMergeMode: QuoteLineExecutionMergeMode.MERGE_INTO_JOB_STAGES,
  taskCount: 1,
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

test("evaluateQuoteJobActivationReadiness blocks lines that need execution review", () => {
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    lines: [line({ taskCount: 0 })],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "LINE_NEEDS_EXECUTION_REVIEW");
});

test("evaluateQuoteJobActivationReadiness blocks commercial-only lines that still have tasks", () => {
  const readiness = evaluateQuoteJobActivationReadiness({
    status: QuoteStatus.APPROVED,
    lines: [
      line({
        executionReviewStatus: QuoteLineExecutionReviewStatus.NO_EXECUTION_NEEDED,
        taskCount: 2,
      }),
    ],
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "LINE_COMMERCIAL_ONLY_HAS_TASKS");
});
