import assert from "node:assert/strict";
import test from "node:test";
import {
  PaymentScheduleAnchorType,
  QuoteStatus,
} from "@prisma/client";
import {
  evaluateQuoteJobActivationReadiness,
  quoteActivationOnlyBlockedByApproval,
  type QuoteActivationReadinessInput,
} from "./quote-job-activation-readiness";

const line = (
  overrides: Partial<{
    id: string;
    description: string;
    executionRelevant: boolean;
    tasks: {
      id: string;
      title: string;
      stageId: string | null;
      providesSignals: string[];
      requiresSignals: string[];
      hardSignal: boolean;
    }[];
  }> = {},
) => ({
  id: "line-1",
  description: "Rough-in",
  executionRelevant: true,
  tasks: [
    {
      id: "task-1",
      title: "Task 1",
      stageId: "stage-1",
      providesSignals: [],
      requiresSignals: [],
      hardSignal: false,
    },
  ],
  ...overrides,
});

function readinessInput(
  overrides: Partial<QuoteActivationReadinessInput> = {},
): QuoteActivationReadinessInput {
  const status = overrides.status ?? QuoteStatus.APPROVED;
  return {
    quoteTotalCents: 0,
    paymentSchedule: [],
    lines: [],
    hasApprovalCheckpoint: status === QuoteStatus.APPROVED,
    ...overrides,
    status,
  };
}

test("evaluateQuoteJobActivationReadiness blocks when approved quote has no approval checkpoint", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      hasApprovalCheckpoint: false,
      lines: [line()],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "APPROVAL_CHECKPOINT_MISSING");
  assert.equal(quoteActivationOnlyBlockedByApproval(readiness), false);
});

test("evaluateQuoteJobActivationReadiness is ready when approved quote has approval checkpoint", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      hasApprovalCheckpoint: true,
      lines: [line()],
    }),
  );

  assert.equal(readiness.ready, true);
});

test("evaluateQuoteJobActivationReadiness does not emit checkpoint missing for sent quote", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.SENT,
      hasApprovalCheckpoint: false,
      lines: [line()],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "QUOTE_NOT_APPROVED");
  assert.equal(
    readiness.blockReasons.some((r) => r.code === "APPROVAL_CHECKPOINT_MISSING"),
    false,
  );
});

test("evaluateQuoteJobActivationReadiness is ready for approved quote with executable tasks", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [line()],
    }),
  );

  assert.equal(readiness.ready, true);
  assert.equal(readiness.totalTasksToActivate, 1);
  assert.equal(readiness.blockReasons.length, 0);
});

test("evaluateQuoteJobActivationReadiness blocks when quote is not approved", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.SENT,
      lines: [line()],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "QUOTE_NOT_APPROVED");
  assert.equal(quoteActivationOnlyBlockedByApproval(readiness), true);
});

test("evaluateQuoteJobActivationReadiness blocks when hard signal has no provider", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [
      line({
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            stageId: "stage-1",
            providesSignals: [],
            requiresSignals: ["hard-fact"],
            hardSignal: true,
          },
        ],
      }),
    ],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "HARD_SIGNAL_NO_PROVIDER");
});

test("evaluateQuoteJobActivationReadiness treats equivalent signal keys as satisfied", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [
        line({
          tasks: [
            {
              id: "task-provider",
              title: "Confirm permit approval",
              stageId: "stage-1",
              providesSignals: ["permit-approved"],
              requiresSignals: [],
              hardSignal: false,
            },
            {
              id: "task-consumer",
              title: "Schedule utility reconnect",
              stageId: "stage-1",
              providesSignals: [],
              requiresSignals: ["permit.approved"],
              hardSignal: true,
            },
          ],
        }),
      ],
    }),
  );

  assert.equal(readiness.ready, true);
  assert.equal(
    readiness.blockReasons.some((reason) => reason.code === "HARD_SIGNAL_NO_PROVIDER"),
    false,
  );
});

test("evaluateQuoteJobActivationReadiness detects circular dependencies", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [
      line({
        tasks: [
          {
            id: "task-1",
            title: "Task 1",
            stageId: "stage-1",
            providesSignals: ["signal-a"],
            requiresSignals: ["signal-b"],
            hardSignal: false,
          },
          {
            id: "task-2",
            title: "Task 2",
            stageId: "stage-1",
            providesSignals: ["signal-b"],
            requiresSignals: ["signal-a"],
            hardSignal: false,
          },
        ],
      }),
    ],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "CIRCULAR_SIGNAL_DEPENDENCY");
});

test("evaluateQuoteJobActivationReadiness blocks when task missing stage", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [
      line({
        tasks: [
          {
            id: "task-1",
            title: "No stage task",
            stageId: null,
            providesSignals: [],
            requiresSignals: [],
            hardSignal: false,
          },
        ],
      }),
    ],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "TASK_MISSING_STAGE");
});

test("evaluateQuoteJobActivationReadiness allows percentage-only milestone without final balance", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [line()],
      quoteTotalCents: 1_000_000,
      paymentSchedule: [
        {
          id: "pay-1",
          title: "Deposit",
          anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
          amountCents: null,
          percentage: "30",
        },
      ],
    }),
  );

  assert.equal(readiness.ready, true);
});

test("evaluateQuoteJobActivationReadiness blocks milestone missing amount and percentage", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      lines: [line()],
      quoteTotalCents: 1_000_000,
      paymentSchedule: [
        {
          id: "pay-1",
          title: "Deposit",
          anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
          amountCents: null,
          percentage: null,
        },
      ],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.equal(readiness.blockReasons[0]?.code, "PAYMENT_MILESTONE_MISSING_AMOUNT");
});

test("activation readiness parity: approved without checkpoint blocks same gate server enforces", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      status: QuoteStatus.APPROVED,
      hasApprovalCheckpoint: false,
      lines: [line()],
      quoteTotalCents: 1_000_000,
      paymentSchedule: [],
    }),
  );

  assert.equal(readiness.ready, false);
  assert.ok(
    readiness.blockReasons.some((r) => r.code === "APPROVAL_CHECKPOINT_MISSING"),
    "UI readiness must block before server-only checkpoint gate would reject",
  );
});

test("evaluateQuoteJobActivationReadiness blocks when execution plan is not accepted", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      lines: [line()],
      executionPlan: {
        status: "READY_FOR_REVIEW",
        planVersion: 3,
        acceptedPlanningInputHash: "hash-a",
        currentPlanningInputHash: "hash-a",
      },
    }),
  );
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockReasons.some((r) => r.code === "PLAN_NOT_ACCEPTED"));
});

test("evaluateQuoteJobActivationReadiness blocks stale accepted plan hash", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      lines: [line()],
      executionPlan: {
        status: "ACCEPTED",
        planVersion: 3,
        acceptedPlanningInputHash: "hash-a",
        currentPlanningInputHash: "hash-b",
      },
    }),
  );
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockReasons.some((r) => r.code === "PLAN_STALE"));
});

test("evaluateQuoteJobActivationReadiness blocks uncovered execution-relevant lines", () => {
  const readiness = evaluateQuoteJobActivationReadiness(
    readinessInput({
      lines: [
        line({ id: "line-covered", description: "Covered scope" }),
        line({
          id: "line-uncovered",
          description: "Uncovered scope",
          executionRelevant: true,
          tasks: [],
        }),
      ],
      executionPlan: {
        status: "ACCEPTED",
        planVersion: 3,
        acceptedPlanningInputHash: "hash-a",
        currentPlanningInputHash: "hash-a",
      },
    }),
  );
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockReasons.some((r) => r.code === "EXECUTION_SCOPE_NOT_COVERED"));
});
