import assert from "node:assert/strict";
import test from "node:test";
import {
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
  JobTaskStatus,
} from "@prisma/client";
import {
  isPaymentEffectivelyDue,
  getUnsettledEffectivelyDueRequirements,
  buildPaymentDueContextFromJob,
  type PaymentDueContext,
  type PaymentRequirementRow,
} from "./job-payment-readiness";

function req(
  overrides: Partial<PaymentRequirementRow> & Pick<PaymentRequirementRow, "id" | "title" | "status">,
): PaymentRequirementRow {
  return {
    requiredBeforeStageId: null,
    sourcePaymentScheduleItemId: null,
    sourcePaymentScheduleItem: null,
    ...overrides,
  };
}

function baseCtx(overrides: Partial<PaymentDueContext> = {}): PaymentDueContext {
  return {
    jobIsActive: true,
    stages: [
      { id: "stage-1", sortOrder: 0, executionState: "OPEN" },
      { id: "stage-2", sortOrder: 10, executionState: "OPEN" },
    ],
    orgStageIdToJobStageId: {},
    allRequirements: [],
    ...overrides,
  };
}

test("isPaymentEffectivelyDue: DUE is always effectively due", () => {
  const ctx = baseCtx();
  assert.equal(
    isPaymentEffectivelyDue(
      req({ id: "1", title: "Deposit", status: JobPaymentRequirementStatus.DUE }),
      ctx,
    ),
    true,
  );
});

test("isPaymentEffectivelyDue: PAID is never due", () => {
  const ctx = baseCtx();
  assert.equal(
    isPaymentEffectivelyDue(
      req({ id: "1", title: "Deposit", status: JobPaymentRequirementStatus.PAID }),
      ctx,
    ),
    false,
  );
});

test("isPaymentEffectivelyDue: manual PENDING never auto-due", () => {
  const ctx = baseCtx();
  assert.equal(
    isPaymentEffectivelyDue(
      req({ id: "1", title: "Manual", status: JobPaymentRequirementStatus.PENDING }),
      ctx,
    ),
    false,
  );
});

test("isPaymentEffectivelyDue: UPON_APPROVAL due when job active", () => {
  const ctx = baseCtx({ jobIsActive: true });
  assert.equal(
    isPaymentEffectivelyDue(
      req({
        id: "1",
        title: "Deposit",
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "sched-1",
        sourcePaymentScheduleItem: {
          anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
          anchorStageId: null,
        },
      }),
      ctx,
    ),
    true,
  );
});

test("isPaymentEffectivelyDue: BEFORE_STAGE not due until stage reached", () => {
  const notReachedCtx = baseCtx({
    stages: [
      { id: "stage-1", sortOrder: 0, executionState: "OPEN" },
      { id: "stage-2", sortOrder: 10, executionState: "OPEN" },
    ],
  });

  const beforeStage = req({
    id: "1",
    title: "Milestone",
    status: JobPaymentRequirementStatus.PENDING,
    requiredBeforeStageId: "stage-2",
    sourcePaymentScheduleItemId: "sched-1",
    sourcePaymentScheduleItem: {
      anchorType: PaymentScheduleAnchorType.BEFORE_STAGE,
      anchorStageId: null,
    },
  });

  // Still on stage-1 — payment before stage-2 not yet due
  assert.equal(isPaymentEffectivelyDue(beforeStage, notReachedCtx), false);

  const reachedCtx = baseCtx({
    stages: [
      { id: "stage-1", sortOrder: 0, executionState: "COMPLETED" },
      { id: "stage-2", sortOrder: 10, executionState: "OPEN" },
    ],
  });
  // Earliest incomplete is stage-2 (sortOrder 10), target is stage-2 → reached
  assert.equal(isPaymentEffectivelyDue(beforeStage, reachedCtx), true);
});

test("isPaymentEffectivelyDue: FINAL_BALANCE conservative — hidden when milestones unsettled", () => {
  const deposit = req({
    id: "dep",
    title: "Deposit",
    status: JobPaymentRequirementStatus.PENDING,
    sourcePaymentScheduleItemId: "s1",
    sourcePaymentScheduleItem: {
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      anchorStageId: null,
    },
  });
  const finalBal = req({
    id: "final",
    title: "Final",
    status: JobPaymentRequirementStatus.PENDING,
    sourcePaymentScheduleItemId: "s2",
    sourcePaymentScheduleItem: {
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      anchorStageId: null,
    },
  });

  const ctx = baseCtx({
    allRequirements: [deposit, finalBal],
    stages: [
      { id: "stage-1", sortOrder: 0, executionState: "COMPLETED" },
    ],
  });

  assert.equal(isPaymentEffectivelyDue(finalBal, ctx), false);
});

test("isPaymentEffectivelyDue: FINAL_BALANCE due only when milestones settled and main path complete", () => {
  const deposit = req({
    id: "dep",
    title: "Deposit",
    status: JobPaymentRequirementStatus.PAID,
    sourcePaymentScheduleItemId: "s1",
    sourcePaymentScheduleItem: {
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      anchorStageId: null,
    },
  });
  const finalBal = req({
    id: "final",
    title: "Final",
    status: JobPaymentRequirementStatus.PENDING,
    sourcePaymentScheduleItemId: "s2",
    sourcePaymentScheduleItem: {
      anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      anchorStageId: null,
    },
  });

  const ctx = baseCtx({
    allRequirements: [deposit, finalBal],
    stages: [
      { id: "stage-1", sortOrder: 0, executionState: "COMPLETED" },
    ],
  });

  assert.equal(isPaymentEffectivelyDue(finalBal, ctx), true);
});

test("isPaymentEffectivelyDue: FINAL_BALANCE with missing anchor join not auto-due", () => {
  const ctx = baseCtx({
    stages: [{ id: "stage-1", sortOrder: 0, executionState: "COMPLETED" }],
  });
  assert.equal(
    isPaymentEffectivelyDue(
      req({
        id: "final",
        title: "Final",
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "s2",
        sourcePaymentScheduleItem: null,
      }),
      ctx,
    ),
    false,
  );
});

test("getUnsettledEffectivelyDueRequirements filters correctly", () => {
  const deposit = req({
    id: "dep",
    title: "Deposit",
    status: JobPaymentRequirementStatus.PENDING,
    sourcePaymentScheduleItemId: "s1",
    sourcePaymentScheduleItem: {
      anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
      anchorStageId: null,
    },
  });
  const ctx = buildPaymentDueContextFromJob({
    status: "ACTIVE",
    stages: [{ id: "stage-1", sortOrder: 0, stageId: null, tasks: [{ status: JobTaskStatus.TODO }] }],
    paymentRequirements: [deposit],
  });

  const due = getUnsettledEffectivelyDueRequirements([deposit], ctx);
  assert.equal(due.length, 1);
  assert.equal(due[0].id, "dep");
});

test("buildPaymentDueContextFromJob derives SKIPPED when all applicable tasks are canceled", () => {
  const ctx = buildPaymentDueContextFromJob({
    status: "ACTIVE",
    stages: [
      {
        id: "stage-1",
        sortOrder: 0,
        stageId: "org-stage-1",
        title: "Installation",
        tasks: [
          { status: JobTaskStatus.CANCELED },
          { status: JobTaskStatus.CANCELED },
        ],
      },
    ],
    paymentRequirements: [],
  });

  assert.equal(ctx.stages[0]?.executionState, "SKIPPED");
});
