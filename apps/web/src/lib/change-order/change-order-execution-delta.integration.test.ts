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
  JobTaskStatus,
  StaffRole,
} from "@prisma/client";
import { db } from "@/lib/db";
import {
  applyChangeOrderWithActor,
  createChangeOrderDraftWithActor,
  markChangeOrderAcceptedWithActor,
  updateChangeOrderDraftWithActor,
} from "@/lib/change-order/change-order-lifecycle";
import { changeOrderExecutionDeltaToJson } from "@/lib/change-order/execution-delta-schema";
import { applyChangeOrderExecutionDeltaInTx } from "@/lib/change-order/execution-delta-apply";
import type { ChangeOrderExecutionDeltaProposal } from "@/lib/change-order/execution-delta-schema";
import {
  buildAddLine,
  cleanupChangeOrderJobFixture,
  countActiveScopeItems,
  countActiveTasks,
  createChangeOrderJobFixture,
  createChangeOrderShareToken,
  markChangeOrderSent,
  OFFICE_ACTOR,
  requireDevOrgForIntegrationTest,
} from "@/lib/change-order/change-order-test-fixture";
import { requestChangeOrderChangesForShareToken } from "@/lib/change-order/change-order-portal";

const FIELD_ACTOR = { ...OFFICE_ACTOR, role: StaffRole.FIELD };
const VIEWER_ACTOR = { ...OFFICE_ACTOR, role: StaffRole.VIEWER };

test("integration: price-impact DRAFT staff accept is rejected", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) {
    return;
  }
  const fixture = await createChangeOrderJobFixture("price-draft-reject");
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

    const accepted = await markChangeOrderAcceptedWithActor(OFFICE_ACTOR, created.changeOrderId);
    assert.equal(accepted.ok, false);
    if (!accepted.ok) {
      assert.match(accepted.error, /sent to the customer/i);
    }
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

    const [coA, coB] = await Promise.all([createAccepted("CO A"), createAccepted("CO B")]);
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
    const token = await createChangeOrderShareToken(created.changeOrderId);
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
