/**
 * DB integration tests for Change Order execution delta hardening.
 * Requires DATABASE_URL and dev seed (dev-org-id).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderCheckpointKind,
  ChangeOrderStatus,
  JobPaymentRequirementStatus,
  JobTaskStatus,
  Prisma,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  applyChangeOrderWithActor,
  createChangeOrderDraftWithActor,
  markChangeOrderAcceptedWithActor,
  updateChangeOrderDraftWithActor,
  validateStoredExecutionDeltaForChangeOrder,
  validateStoredPaymentImpactForChangeOrder,
} from "@/lib/change-order/change-order-lifecycle";
import { changeOrderExecutionDeltaToJson } from "@/lib/change-order/execution-delta-schema";
import { buildDefaultExecutionDeltaFromChangeOrderLines } from "@/lib/change-order/execution-delta-build";
import { applyChangeOrderExecutionDeltaInTx } from "@/lib/change-order/execution-delta-apply";
import type { ChangeOrderExecutionDeltaProposal } from "@/lib/change-order/execution-delta-schema";
import { parseChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";
import {
  buildAddLine,
  buildAddToFinalPaymentImpactJson,
  buildAddToNextPaymentImpactJson,
  buildCreditPaymentImpactJson,
  buildDepositRestToFinalImpactJson,
  buildDueBeforeAddedWorkPaymentImpactJson,
  buildManualPaymentImpactJson,
  buildSplitPaymentImpactJson,
  cleanupChangeOrderJobFixture,
  countActiveScopeItems,
  countActiveTasks,
  createChangeOrderJobFixture,
  createChangeOrderShareToken,
  markChangeOrderSent,
  OFFICE_ACTOR,
  requireDevOrgForIntegrationTest,
  seedJobPaymentRequirements,
} from "@/lib/change-order/change-order-test-fixture";
import { requestChangeOrderChangesForShareToken } from "@/lib/change-order/change-order-portal";
import {
  buildPaymentDueContextFromJob,
  getUnsettledEffectivelyDueRequirements,
  isPaymentEffectivelyDue,
} from "@/lib/job-payment-readiness";

const FIELD_ACTOR = { ...OFFICE_ACTOR, role: StaffRole.FIELD };
const VIEWER_ACTOR = { ...OFFICE_ACTOR, role: StaffRole.VIEWER };

test("integration: price-impact draft without payment strategy can persist; send/accept gated", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("price-draft-no-payment");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Add paid scope",
      priceDeltaCents: 25000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 25000 }],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const deltaReady = await validateStoredExecutionDeltaForChangeOrder(
      created.changeOrderId,
      OFFICE_ACTOR.organizationId,
    );
    assert.equal(deltaReady.ok, true);

    const paymentReady = await validateStoredPaymentImpactForChangeOrder(
      created.changeOrderId,
      OFFICE_ACTOR.organizationId,
    );
    assert.equal(paymentReady.ok, false);
    assert.match(
      paymentReady.ok ? "" : paymentReady.error,
      /choose and save|payment strategy|payment terms/i,
    );
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: zero-dollar internal accept from DRAFT works", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("zero-accept");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Internal scope tweak",
      priceDeltaCents: 0,
      lines: [buildAddLine()],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const tasksBefore = await countActiveTasks(fixture.jobId);

    const accepted = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(accepted.ok, true);

    const checkpoints = await db.changeOrderCheckpoint.count({
      where: {
        changeOrderId: created.changeOrderId,
        kind: ChangeOrderCheckpointKind.ACCEPTANCE,
      },
    });
    assert.equal(checkpoints, 1);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);
    assert.equal(await countActiveTasks(fixture.jobId), tasksBefore);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: price-impact CO rejects accept without payment impact", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("price-no-payment");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Paid add",
      priceDeltaCents: 0,
      lines: [buildAddLine("Paid add")],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await db.changeOrder.update({
      where: { id: created.changeOrderId },
      data: {
        priceDeltaCents: 25000,
        paymentImpactJson: Prisma.DbNull,
      },
    });

    await markChangeOrderSent(created.changeOrderId);
    const paymentReady = await validateStoredPaymentImpactForChangeOrder(
      created.changeOrderId,
      OFFICE_ACTOR.organizationId,
    );
    assert.equal(paymentReady.ok, false);

    const accepted = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(accepted.ok, false);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: price-impact SENT staff accept works and enables apply", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("price-sent-accept");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Paid add",
      priceDeltaCents: 15000,
      lines: [{ ...buildAddLine("Paid panel"), priceDeltaCents: 15000 }],
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(15000),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    const accepted = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(accepted.ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);
    if (applied.ok) {
      assert.equal(applied.resultingJobPlanVersion, fixture.jobPlanVersion + 1);
    }

    const coPayments = await db.jobPaymentRequirement.findMany({
      where: {
        organizationId: OFFICE_ACTOR.organizationId,
        sourceChangeOrderId: created.changeOrderId,
      },
    });
    assert.equal(coPayments.length, 1);
    assert.equal(coPayments[0]?.status, JobPaymentRequirementStatus.DUE);
    assert.equal(coPayments[0]?.amountCents, 15000);
    assert.match(coPayments[0]?.title ?? "", /CO-/);
    assert.equal(coPayments[0]?.sourcePaymentScheduleItemId, null);

    const job = await db.job.findUniqueOrThrow({
      where: { id: fixture.jobId },
      select: {
        status: true,
        stages: {
          select: {
            id: true,
            sortOrder: true,
            stageId: true,
            tasks: { select: { status: true, recoveryFlowId: true } },
          },
        },
        paymentRequirements: {
          select: {
            id: true,
            title: true,
            amountCents: true,
            status: true,
            sourcePaymentScheduleItemId: true,
            requiredBeforeStageId: true,
          },
        },
      },
    });
    const paymentCtx = buildPaymentDueContextFromJob({
      ...job,
      paymentRequirements: job.paymentRequirements.map((req) => ({
        ...req,
        sourcePaymentScheduleItem: null,
      })),
    });
    assert.equal(
      isPaymentEffectivelyDue(
        {
          id: coPayments[0]!.id,
          title: coPayments[0]!.title,
          status: coPayments[0]!.status,
          sourcePaymentScheduleItemId: null,
          requiredBeforeStageId: null,
          sourcePaymentScheduleItem: null,
        },
        paymentCtx,
      ),
      true,
    );
    const dueRequirements = getUnsettledEffectivelyDueRequirements(
      job.paymentRequirements.map((req) => ({
        ...req,
        sourcePaymentScheduleItem: null,
      })),
      paymentCtx,
    );
    assert.ok(dueRequirements.some((req) => req.id === coPayments[0]?.id));

    const storedDelta = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { executionDeltaJson: true },
    });
    assert.doesNotMatch(JSON.stringify(storedDelta?.executionDeltaJson), /UPDATE_PAYMENT_REQUIREMENT/);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: apply increases next unpaid payment without duplicate CO row", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("add-to-next-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Add to deposit",
      priceDeltaCents: 10_000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 10_000 }],
      paymentImpactJson: buildAddToNextPaymentImpactJson({
        priceDeltaCents: 10_000,
        targetPaymentRequirementId: payments.depositRequirement.id,
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(deposit?.amountCents, 60_000);

    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coSourced, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: credit strategy reduces final payment first", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("credit-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Credit scope reduction",
      priceDeltaCents: -20_000,
      lines: [{ ...buildAddLine("Credit line"), priceDeltaCents: -20_000 }],
      paymentImpactJson: buildCreditPaymentImpactJson({ priceDeltaCents: -20_000 }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(final?.amountCents, 30_000);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: apply increases final payment only for ADD_TO_FINAL strategy", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("add-to-final-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Add to final",
      priceDeltaCents: 8000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 8000 }],
      paymentImpactJson: buildAddToFinalPaymentImpactJson({
        priceDeltaCents: 8000,
        targetPaymentRequirementId: payments.finalRequirement.id,
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(deposit?.amountCents, 50_000);
    assert.equal(final?.amountCents, 58_000);

    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coSourced, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: split strategy updates multiple payments on apply", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("split-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Split add",
      priceDeltaCents: 10_000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 10_000 }],
      paymentImpactJson: buildSplitPaymentImpactJson({
        priceDeltaCents: 10_000,
        depositRequirementId: payments.depositRequirement.id,
        finalRequirementId: payments.finalRequirement.id,
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(deposit?.amountCents, 55_000);
    assert.equal(final?.amountCents, 55_000);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: deposit rest to final creates CO row and updates final", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("deposit-final-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Deposit and final",
      priceDeltaCents: 10_000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 10_000 }],
      paymentImpactJson: buildDepositRestToFinalImpactJson({
        priceDeltaCents: 10_000,
        depositCents: 3000,
        finalRequirementId: payments.finalRequirement.id,
        changeOrderNumber: 1,
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });

    assert.equal(deposit?.amountCents, 50_000);
    assert.equal(final?.amountCents, 57_000);
    assert.equal(coSourced, 1);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: settled payment requirements are not mutated on apply", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("settled-target-guard");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    await db.jobPaymentRequirement.update({
      where: { id: payments.depositRequirement.id },
      data: { status: JobPaymentRequirementStatus.PAID },
    });

    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Add to paid deposit",
      priceDeltaCents: 5000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 5000 }],
      paymentImpactJson: buildAddToNextPaymentImpactJson({
        priceDeltaCents: 5000,
        targetPaymentRequirementId: payments.depositRequirement.id,
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true, status: true },
    });
    assert.equal(deposit?.amountCents, 50_000);
    assert.equal(deposit?.status, JobPaymentRequirementStatus.PAID);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: payment materialization failure rolls back scope mutations", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("payment-rollback");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Stale target",
      priceDeltaCents: 5000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 5000 }],
      paymentImpactJson: buildAddToNextPaymentImpactJson({
        priceDeltaCents: 5000,
        targetPaymentRequirementId: payments.depositRequirement.id,
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    await db.jobPaymentRequirement.update({
      where: { id: payments.depositRequirement.id },
      data: { status: JobPaymentRequirementStatus.WAIVED },
    });

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const tasksBefore = await countActiveTasks(fixture.jobId);
    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);
    assert.equal(await countActiveTasks(fixture.jobId), tasksBefore);

    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coSourced, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: MANUAL allocation applies exact saved target amounts", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("manual-split-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Manual split add",
      priceDeltaCents: 10_000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 10_000 }],
      paymentImpactJson: buildManualPaymentImpactJson({
        preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
        priceDeltaCents: 10_000,
        depositRequirementId: payments.depositRequirement.id,
        finalRequirementId: payments.finalRequirement.id,
        manualNewAmountsById: {
          [payments.depositRequirement.id]: 52_000,
          [payments.finalRequirement.id]: 58_000,
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(deposit?.amountCents, 52_000);
    assert.equal(final?.amountCents, 58_000);

    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coSourced, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: MANUAL deposit allocation creates CO DUE row and updates target rows", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("manual-deposit-apply");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Manual deposit and final",
      priceDeltaCents: 10_000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 10_000 }],
      paymentImpactJson: buildManualPaymentImpactJson({
        preset: "DEPOSIT_NOW_REST_TO_FINAL",
        priceDeltaCents: 10_000,
        depositCents: 4000,
        changeOrderNumber: 1,
        depositRequirementId: payments.depositRequirement.id,
        finalRequirementId: payments.finalRequirement.id,
        manualNewAmountsById: {
          [payments.finalRequirement.id]: 56_000,
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, true);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    const coSourced = await db.jobPaymentRequirement.findMany({
      where: { sourceChangeOrderId: created.changeOrderId },
      select: { amountCents: true, status: true },
    });

    assert.equal(deposit?.amountCents, 50_000);
    assert.equal(final?.amountCents, 56_000);
    assert.equal(coSourced.length, 1);
    assert.equal(coSourced[0]?.amountCents, 4000);
    assert.equal(coSourced[0]?.status, JobPaymentRequirementStatus.DUE);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: MANUAL allocation fails safely when target paid after acceptance", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("manual-paid-target-guard");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Manual add to deposit",
      priceDeltaCents: 5000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 5000 }],
      paymentImpactJson: buildManualPaymentImpactJson({
        preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
        priceDeltaCents: 5000,
        depositRequirementId: payments.depositRequirement.id,
        finalRequirementId: payments.finalRequirement.id,
        manualNewAmountsById: {
          [payments.depositRequirement.id]: 52_500,
          [payments.finalRequirement.id]: 52_500,
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    await db.jobPaymentRequirement.update({
      where: { id: payments.depositRequirement.id },
      data: { status: JobPaymentRequirementStatus.PAID },
    });

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const depositBefore = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true, status: true },
    });
    const finalBefore = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true, status: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(deposit?.amountCents, depositBefore?.amountCents);
    assert.equal(deposit?.status, depositBefore?.status);
    assert.equal(final?.amountCents, finalBefore?.amountCents);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);

    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coSourced, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: MANUAL allocation fails safely when target amount changed after acceptance", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("manual-amount-drift");
  try {
    const payments = await seedJobPaymentRequirements(fixture);
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Manual stale target",
      priceDeltaCents: 5000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 5000 }],
      paymentImpactJson: buildManualPaymentImpactJson({
        preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
        priceDeltaCents: 5000,
        depositRequirementId: payments.depositRequirement.id,
        finalRequirementId: payments.finalRequirement.id,
        manualNewAmountsById: {
          [payments.depositRequirement.id]: 52_500,
          [payments.finalRequirement.id]: 52_500,
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await markChangeOrderSent(created.changeOrderId);
    assert.equal((await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId)).ok, true);

    await db.jobPaymentRequirement.update({
      where: { id: payments.depositRequirement.id },
      data: { amountCents: 48_000 },
    });

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const tasksBefore = await countActiveTasks(fixture.jobId);
    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);
    assert.equal(await countActiveTasks(fixture.jobId), tasksBefore);

    const deposit = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.depositRequirement.id },
      select: { amountCents: true },
    });
    const final = await db.jobPaymentRequirement.findUnique({
      where: { id: payments.finalRequirement.id },
      select: { amountCents: true },
    });
    assert.equal(deposit?.amountCents, 48_000);
    assert.equal(final?.amountCents, 50_000);

    const coSourced = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coSourced, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: legacy payment op with paymentImpactJson is rejected at apply", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("double-count-guard");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Dual payment paths",
      priceDeltaCents: 9000,
      lines: [{ ...buildAddLine("Paid add"), priceDeltaCents: 9000 }],
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(9000),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const stored = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { executionDeltaJson: true },
    });
    const delta = stored?.executionDeltaJson as { operations?: { type?: string }[] };
    assert.ok(delta?.operations?.every((op) => op.type !== "UPDATE_PAYMENT_REQUIREMENT"));

    await db.changeOrder.update({
      where: { id: created.changeOrderId },
      data: {
        executionDeltaJson: {
          ...(stored?.executionDeltaJson as object),
          operations: [
            ...(((stored?.executionDeltaJson as { operations?: unknown[] })?.operations ?? []) as unknown[]),
            {
              opId: "legacy:payment",
              type: "UPDATE_PAYMENT_REQUIREMENT",
              targetEntityType: "JobPaymentRequirement",
              payload: { amountDeltaCents: 9000 },
              reason: "Legacy duplicate",
            },
          ],
        },
        status: ChangeOrderStatus.ACCEPTED,
        applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
      },
    });
    await db.changeOrderCheckpoint.create({
      data: {
        organizationId: OFFICE_ACTOR.organizationId,
        changeOrderId: created.changeOrderId,
        kind: ChangeOrderCheckpointKind.ACCEPTANCE,
        source: "STAFF",
        sequence: 1,
        schemaVersion: 1,
        snapshotJson: {},
        changeOrderUpdatedAtAtCapture: new Date(),
      },
    });

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);

    const coPayments = await db.jobPaymentRequirement.count({
      where: { sourceChangeOrderId: created.changeOrderId },
    });
    assert.equal(coPayments, 0);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: legacy-only price CO cannot apply without paymentImpactJson", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("legacy-no-payment-impact");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Legacy paid add",
      priceDeltaCents: 0,
      lines: [buildAddLine("Legacy paid")],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const line = await db.changeOrderLine.findFirst({
      where: { changeOrderId: created.changeOrderId },
      select: {
        id: true,
        operation: true,
        sourceJobScopeItemId: true,
        description: true,
        quantity: true,
        unitPriceCents: true,
        priceDeltaCents: true,
        executionRelevant: true,
      },
    });
    assert.ok(line);

    const legacyDelta = buildDefaultExecutionDeltaFromChangeOrderLines({
      baseJobPlanVersion: fixture.jobPlanVersion,
      changeOrderId: created.changeOrderId,
      number: 1,
      priceDeltaCents: 12_000,
      reasoning: "Legacy paid add",
      lines: [{ ...line, priceDeltaCents: 12_000 }],
      skipLegacyPaymentOperation: false,
    });

    await db.changeOrder.update({
      where: { id: created.changeOrderId },
      data: {
        priceDeltaCents: 12_000,
        paymentImpactJson: Prisma.DbNull,
        status: ChangeOrderStatus.ACCEPTED,
        applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
        executionDeltaJson: changeOrderExecutionDeltaToJson(legacyDelta),
      },
    });
    await db.changeOrderCheckpoint.create({
      data: {
        organizationId: OFFICE_ACTOR.organizationId,
        changeOrderId: created.changeOrderId,
        kind: ChangeOrderCheckpointKind.ACCEPTANCE,
        source: "STAFF",
        sequence: 1,
        schemaVersion: 1,
        snapshotJson: {},
        changeOrderUpdatedAtAtCapture: new Date(),
      },
    });

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);

    const row = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { applicationStatus: true },
    });
    assert.equal(row?.applicationStatus, ChangeOrderApplicationStatus.APPLY_FAILED);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: duplicate staff accept is rejected", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("duplicate-accept");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Internal add",
      lines: [buildAddLine()],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const first = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(first.ok, true);
    const second = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(second.ok, false);

    const checkpoints = await db.changeOrderCheckpoint.count({
      where: { changeOrderId: created.changeOrderId, kind: ChangeOrderCheckpointKind.ACCEPTANCE },
    });
    assert.equal(checkpoints, 1);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: draft update refreshes stored execution delta", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("draft-update");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Initial reasoning",
      lines: [buildAddLine("First line")],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const updated = await updateChangeOrderDraftWithActor(OFFICE_ACTOR, {
      changeOrderId: created.changeOrderId,
      reasoning: "Updated reasoning",
      lines: [buildAddLine("Updated line")],
    });
    assert.equal(updated.ok, true);

    const row = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { reasoning: true, executionDeltaJson: true, baseJobPlanVersion: true },
    });
    assert.equal(row?.reasoning, "Updated reasoning");
    assert.equal(row?.baseJobPlanVersion, fixture.jobPlanVersion);
    assert.ok(JSON.stringify(row?.executionDeltaJson).includes("Updated line"));
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: draft update persists v2 paymentImpactJson", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("payment-impact-save-v2");
  try {
    const paidLine = { ...buildAddLine("Paid add"), priceDeltaCents: 10_000 };
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Paid add",
      priceDeltaCents: 10_000,
      lines: [paidLine],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const payments = await seedJobPaymentRequirements(fixture);
    const paymentImpactJson = buildSplitPaymentImpactJson({
      priceDeltaCents: 10_000,
      depositRequirementId: payments.depositRequirement.id,
      finalRequirementId: payments.finalRequirement.id,
    });

    const updated = await updateChangeOrderDraftWithActor(OFFICE_ACTOR, {
      changeOrderId: created.changeOrderId,
      reasoning: "Paid add",
      priceDeltaCents: 10_000,
      lines: [paidLine],
      paymentImpactJson,
    });
    assert.equal(updated.ok, true);

    const row = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { paymentImpactJson: true },
    });
    const parsed = parseChangeOrderPaymentImpact(row?.paymentImpactJson);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.impact.schemaVersion, 2);
    assert.equal(parsed.impact.strategy, "SPLIT_ACROSS_REMAINING_PAYMENTS");
    assert.equal(parsed.impact.allocations.length, 2);
    assert.equal(
      parsed.impact.allocations.reduce((sum, row) => sum + row.adjustmentCents, 0),
      10_000,
    );
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: draft update persists v1 paymentImpactJson", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("payment-impact-save-v1");
  try {
    const paidLine = { ...buildAddLine("Paid add"), priceDeltaCents: 5000 };
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Paid add",
      priceDeltaCents: 5000,
      lines: [paidLine],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const paymentImpactJson = buildDueBeforeAddedWorkPaymentImpactJson(5000);
    const updated = await updateChangeOrderDraftWithActor(OFFICE_ACTOR, {
      changeOrderId: created.changeOrderId,
      reasoning: "Paid add",
      priceDeltaCents: 5000,
      lines: [paidLine],
      paymentImpactJson,
    });
    assert.equal(updated.ok, true);

    const row = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { paymentImpactJson: true },
    });
    const parsed = parseChangeOrderPaymentImpact(row?.paymentImpactJson);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.impact.schemaVersion, 1);
    assert.equal(parsed.impact.strategy, "DUE_BEFORE_ADDED_WORK");
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: sent change order draft update is rejected", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("sent-update-reject");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Send me",
      lines: [buildAddLine()],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await markChangeOrderSent(created.changeOrderId);

    const updated = await updateChangeOrderDraftWithActor(OFFICE_ACTOR, {
      changeOrderId: created.changeOrderId,
      reasoning: "Too late",
    });
    assert.equal(updated.ok, false);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: accepted invalid delta becomes APPLY_FAILED without mutating job", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("invalid-apply");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Missing task coverage",
      lines: [{ ...buildAddLine(), executionRelevant: true }],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const invalidDelta: ChangeOrderExecutionDeltaProposal = {
      schemaVersion: 1,
      baseJobPlanVersion: fixture.jobPlanVersion,
      operations: [
        {
          opId: "scope:only",
          type: "ADD_SCOPE_ITEM",
          targetEntityType: "JobScopeItem",
          payload: {
            description: "Orphan scope",
            quantity: "1",
            executionRelevant: true,
          },
          reason: "Invalid on purpose",
        },
      ],
    };

    await db.changeOrder.update({
      where: { id: created.changeOrderId },
      data: {
        executionDeltaJson: changeOrderExecutionDeltaToJson(invalidDelta),
        status: ChangeOrderStatus.ACCEPTED,
        applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
      },
    });
    await db.changeOrderCheckpoint.create({
      data: {
        organizationId: OFFICE_ACTOR.organizationId,
        changeOrderId: created.changeOrderId,
        kind: ChangeOrderCheckpointKind.ACCEPTANCE,
        source: "STAFF",
        sequence: 1,
        schemaVersion: 1,
        snapshotJson: { document: { reasoning: "test" } },
        changeOrderUpdatedAtAtCapture: new Date(),
      },
    });

    const scopeBefore = await countActiveScopeItems(fixture.jobId);
    const tasksBefore = await countActiveTasks(fixture.jobId);
    const versionBefore = (
      await db.job.findUnique({ where: { id: fixture.jobId }, select: { jobPlanVersion: true } })
    )?.jobPlanVersion;

    const applied = await applyChangeOrderWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(applied.ok, false);

    const row = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { applicationStatus: true, status: true },
    });
    assert.equal(row?.status, ChangeOrderStatus.ACCEPTED);
    assert.equal(row?.applicationStatus, ChangeOrderApplicationStatus.APPLY_FAILED);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);
    assert.equal(await countActiveTasks(fixture.jobId), tasksBefore);
    assert.equal(
      (await db.job.findUnique({ where: { id: fixture.jobId }, select: { jobPlanVersion: true } }))
        ?.jobPlanVersion,
      versionBefore,
    );
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: concurrent apply only succeeds once", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("concurrent-apply");
  try {
    const createAccepted = async (label: string) => {
      const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
        quoteId: fixture.quoteId,
        jobId: fixture.jobId,
        reasoning: label,
        lines: [buildAddLine(label)],
      });
      assert.equal(created.ok, true);
      if (!created.ok) throw new Error("create failed");
      const accepted = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
      assert.equal(accepted.ok, true);
      return created.changeOrderId;
    };

    const coA = await createAccepted("CO A");
    const coB = await createAccepted("CO B");
    const [resultA, resultB] = await Promise.all([
      applyChangeOrderWithActor(OFFICE_ACTOR, coA),
      applyChangeOrderWithActor(OFFICE_ACTOR, coB),
    ]);

    const successes = [resultA, resultB].filter((result) => result.ok);
    assert.equal(successes.length, 1);

    const failed = resultA.ok ? resultB : resultA;
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.match(failed.error, /execution review|apply/i);
    }

    const failedRow = await db.changeOrder.findUnique({
      where: { id: resultA.ok ? coB : coA },
      select: { applicationStatus: true },
    });
    assert.equal(failedRow?.applicationStatus, ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: permission denied for FIELD and VIEWER apply paths", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("permissions");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Permission test",
      lines: [buildAddLine()],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);

    assert.equal((await applyChangeOrderWithActor(FIELD_ACTOR, created.changeOrderId)).ok, false);
    assert.equal((await applyChangeOrderWithActor(VIEWER_ACTOR, created.changeOrderId)).ok, false);
    assert.equal((await createChangeOrderDraftWithActor(FIELD_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Denied",
      lines: [buildAddLine()],
    })).ok, false);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: customer request-changes writes checkpoint without execution mutation", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("request-changes");
  try {
    const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
      quoteId: fixture.quoteId,
      jobId: fixture.jobId,
      reasoning: "Customer review",
      lines: [buildAddLine()],
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await markChangeOrderSent(created.changeOrderId);
    await createChangeOrderShareToken(created.changeOrderId);
    const shareToken = await db.changeOrderShareToken.findFirst({
      where: { changeOrderId: created.changeOrderId },
      select: { id: true },
    });
    assert.ok(shareToken);

    const scopeBefore = await countActiveScopeItems(fixture.jobId);

    const result = await requestChangeOrderChangesForShareToken({
      shareTokenId: shareToken.id,
      message: "Please adjust the panel location.",
    });
    assert.equal(result.ok, true);

    const row = await db.changeOrder.findUnique({
      where: { id: created.changeOrderId },
      select: { status: true },
    });
    assert.equal(row?.status, ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES);
    const checkpoints = await db.changeOrderCheckpoint.count({
      where: {
        changeOrderId: created.changeOrderId,
        kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
      },
    });
    assert.equal(checkpoints, 1);
    assert.equal(await countActiveScopeItems(fixture.jobId), scopeBefore);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: MODIFY_TASK scope relink updates task-scope links in apply tx", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("modify-task-relink");
  try {
    const newScope = await db.jobScopeItem.create({
      data: {
        organizationId: OFFICE_ACTOR.organizationId,
        jobId: fixture.jobId,
        description: "Second scope",
        quantity: "1",
        executionRelevant: true,
      },
      select: { id: true },
    });

    const proposal: ChangeOrderExecutionDeltaProposal = {
      schemaVersion: 1,
      baseJobPlanVersion: fixture.jobPlanVersion,
      operations: [
        {
          opId: "modify:task",
          type: "MODIFY_TASK",
          targetEntityType: "JobTask",
          targetEntityId: fixture.taskId,
          payload: { jobScopeItemIds: [newScope.id] },
          reason: "Relink coverage",
        },
      ],
    };

    await db.$transaction(async (tx) => {
      await applyChangeOrderExecutionDeltaInTx(tx, {
        organizationId: OFFICE_ACTOR.organizationId,
        jobId: fixture.jobId,
        changeOrderId: "co-test",
        actorUserId: OFFICE_ACTOR.userId,
        proposal,
      });
    });

    const links = await db.jobTaskScope.findMany({
      where: { jobTaskId: fixture.taskId },
      select: { jobScopeItemId: true },
    });
    assert.deepEqual(
      links.map((link) => link.jobScopeItemId).sort(),
      [newScope.id].sort(),
    );
  } finally {
    await db.jobScopeItem.deleteMany({ where: { jobId: fixture.jobId, id: { not: fixture.scopeItemId } } });
    await cleanupChangeOrderJobFixture(fixture);
  }
});

test("integration: cancel DONE task fails in apply tx without mutation", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("cancel-done");
  try {
    await db.jobTask.update({
      where: { id: fixture.taskId },
      data: { status: JobTaskStatus.DONE, completedAt: new Date() },
    });

    const proposal: ChangeOrderExecutionDeltaProposal = {
      schemaVersion: 1,
      baseJobPlanVersion: fixture.jobPlanVersion,
      operations: [
        {
          opId: "cancel:done",
          type: "CANCEL_TASK",
          targetEntityType: "JobTask",
          targetEntityId: fixture.taskId,
          reason: "Should fail",
        },
      ],
    };

    await assert.rejects(
      () =>
        db.$transaction(async (tx) =>
          applyChangeOrderExecutionDeltaInTx(tx, {
            organizationId: OFFICE_ACTOR.organizationId,
            jobId: fixture.jobId,
            changeOrderId: "co-test",
            actorUserId: OFFICE_ACTOR.userId,
            proposal,
          }),
        ),
      /completed tasks cannot be canceled/,
    );

    const task = await db.jobTask.findUnique({
      where: { id: fixture.taskId },
      select: { status: true },
    });
    assert.equal(task?.status, JobTaskStatus.DONE);
  } finally {
    await cleanupChangeOrderJobFixture(fixture);
  }
});
