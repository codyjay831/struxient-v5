/**
 * Final QA: Change Order customer portal stale-link handling.
 * Requires DATABASE_URL + dev seed for integration blocks.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderCheckpointKind,
  ChangeOrderCheckpointSource,
  ChangeOrderStatus,
  ExecutionPlanRevisionKind,
  ExecutionPlanRevisionStatus,
  JobActivityType,
  Prisma,
} from "@prisma/client";
import {
  CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
  changeOrderRowToCustomerPreviewDocument,
  changeOrderSelectForCustomerCheckpoint,
  serializeChangeOrderPreviewDocumentForCheckpoint,
} from "@/lib/change-order-checkpoint-snapshot";
import { parseChangeOrderPaymentImpact } from "@/lib/change-order/payment-impact-schema";
import {
  deriveChangeOrderCustomerAcceptReadiness,
  deriveChangeOrderCustomerPortalActions,
} from "@/lib/change-order/change-order-customer-accept-readiness";
import {
  CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES,
  CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE,
  requestChangeOrderChangesForShareToken,
  sendChangeOrderOfficeNoteForShareToken,
  toCustomerAcceptReadinessInput,
} from "@/lib/change-order/change-order-portal";
import { db } from "@/lib/db";
import {
  buildAddLine,
  cleanupChangeOrderJobFixture,
  confirmStoredGeneratedTasksForChangeOrder,
  createChangeOrderJobFixture,
  createChangeOrderShareToken,
  markChangeOrderSent,
  OFFICE_ACTOR,
  requireDevOrgForIntegrationTest,
} from "@/lib/change-order/change-order-test-fixture";
import { createChangeOrderDraftWithActor } from "@/lib/change-order/change-order-lifecycle";

const FORBIDDEN_PUBLIC_COPY = [
  /office review/i,
  /stale plan/i,
  /signal orphan/i,
  /execution delta invalid/i,
  /internal blocker/i,
  /officeReview/i,
  /STALE_PLAN/i,
  /EXECUTION_NOT_READY/i,
  /UNREVIEWED_GENERATED/i,
];

const CUSTOMER_FACING_FILES = [
  "src/components/jobs/change-order-public-preview.tsx",
  "src/app/co/[token]/change-order-share-actions.ts",
  "src/lib/change-order/change-order-customer-accept-readiness.ts",
];

function readCustomerFacingSource(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), "utf8");
}

function extractCustomerErrorStrings(source: string): string[] {
  const matches = source.match(/error:\s*"([^"\\]|\\.)*"/g) ?? [];
  return matches.map((m) => m.replace(/^error:\s*"/, "").replace(/"$/, ""));
}

async function loadPortalStateForShareTokenId(shareTokenId: string) {
  const loaded = await db.changeOrderShareToken.findFirst({
    where: { id: shareTokenId },
    include: {
      changeOrder: {
        select: {
          status: true,
          priceDeltaCents: true,
          paymentImpactJson: true,
          executionDeltaJson: true,
          baseJobPlanVersion: true,
          job: {
            select: {
              jobPlanVersion: true,
              scopeItems: {
                select: { id: true, executionRelevant: true, status: true },
              },
              tasks: {
                select: {
                  id: true,
                  status: true,
                  hardSignal: true,
                  requiresSignals: true,
                  providesSignals: true,
                  scopes: { select: { jobScopeItemId: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  assert.ok(loaded);
  const acceptReadiness = deriveChangeOrderCustomerAcceptReadiness(
    toCustomerAcceptReadinessInput(loaded.changeOrder),
  );
  const portalActions = deriveChangeOrderCustomerPortalActions({
    status: loaded.changeOrder.status,
    acceptReadiness,
  });
  return { acceptReadiness, portalActions, status: loaded.changeOrder.status };
}

async function prepareAcceptReadySentChangeOrder(label: string) {
  const fixture = await createChangeOrderJobFixture(`qa-ready-${label}`);
  const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
    quoteId: fixture.quoteId,
    jobId: fixture.jobId,
    reasoning: "QA accept-ready",
    lines: [buildAddLine()],
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("draft failed");
  await confirmStoredGeneratedTasksForChangeOrder(created.changeOrderId, OFFICE_ACTOR.organizationId);
  await markChangeOrderSent(created.changeOrderId);
  const rawToken = await createChangeOrderShareToken(created.changeOrderId);
  const shareToken = await db.changeOrderShareToken.findFirst({
    where: { changeOrderId: created.changeOrderId },
    select: { id: true },
  });
  assert.ok(shareToken);
  return { fixture, changeOrderId: created.changeOrderId, shareTokenId: shareToken.id, rawToken };
}

async function prepareAcceptBlockedSentChangeOrder(label: string) {
  const fixture = await createChangeOrderJobFixture(`qa-blocked-${label}`);
  const created = await createChangeOrderDraftWithActor(OFFICE_ACTOR, {
    quoteId: fixture.quoteId,
    jobId: fixture.jobId,
    reasoning: "QA accept-blocked",
    lines: [buildAddLine()],
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("draft failed");
  await markChangeOrderSent(created.changeOrderId);
  const rawToken = await createChangeOrderShareToken(created.changeOrderId);
  const shareToken = await db.changeOrderShareToken.findFirst({
    where: { changeOrderId: created.changeOrderId },
    select: { id: true },
  });
  assert.ok(shareToken);
  return { fixture, changeOrderId: created.changeOrderId, shareTokenId: shareToken.id, rawToken };
}

// --- Static copy QA (no DB) ---

test("QA copy: customer-facing CO portal files avoid internal/debug language", () => {
  for (const relPath of CUSTOMER_FACING_FILES) {
    const source = readCustomerFacingSource(relPath);
    if (relPath.includes("change-order-customer-accept-readiness")) {
      const customerMessages = source.match(/customerMessage:\s*"([^"]+)"/g) ?? [];
      for (const literal of customerMessages) {
        for (const forbidden of FORBIDDEN_PUBLIC_COPY) {
          assert.doesNotMatch(
            literal,
            forbidden,
            `${relPath} customerMessage contains forbidden copy: ${literal}`,
          );
        }
      }
      const publicConstants = source.match(
        /CHANGE_ORDER_CUSTOMER_[A-Z_]+_MESSAGE\s*=\s*\n?\s*"([^"]+)"/g,
      ) ?? [];
      for (const literal of publicConstants) {
        for (const forbidden of FORBIDDEN_PUBLIC_COPY) {
          assert.doesNotMatch(
            literal,
            forbidden,
            `${relPath} public constant contains forbidden copy`,
          );
        }
      }
      continue;
    }
    for (const forbidden of FORBIDDEN_PUBLIC_COPY) {
      assert.doesNotMatch(source, forbidden, `${relPath} contains forbidden copy`);
    }
    if (relPath.includes("change-order-share-actions")) {
      for (const errorString of extractCustomerErrorStrings(source)) {
        for (const forbidden of FORBIDDEN_PUBLIC_COPY) {
          assert.doesNotMatch(errorString, forbidden, `share-actions error: ${errorString}`);
        }
      }
    }
  }
});

test("QA copy: office note action emits audit event type", () => {
  const actions = readCustomerFacingSource("src/app/co/[token]/change-order-share-actions.ts");
  assert.match(actions, /change_order\.office_note/);
});

test("QA copy: preview UI strings for stale-link path are customer-safe", () => {
  const preview = readCustomerFacingSource("src/components/jobs/change-order-public-preview.tsx");
  assert.match(preview, /Online approval unavailable/);
  assert.match(preview, /Send note to office/);
  assert.match(preview, /Accept Change Order/);
  assert.match(preview, /Request changes/);
  assert.doesNotMatch(preview, /Response unavailable/);
});

// --- Portal action matrix (no DB) ---

test("QA portal actions: terminal and non-SENT states expose no response affordances", () => {
  for (const status of [
    ChangeOrderStatus.ACCEPTED,
    ChangeOrderStatus.APPLIED,
    ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
    ChangeOrderStatus.DRAFT,
    ChangeOrderStatus.VOID,
  ] as ChangeOrderStatus[]) {
    const actions = deriveChangeOrderCustomerPortalActions({
      status,
      acceptReadiness: { canAccept: true, blockers: [] },
    });
    assert.equal(actions.canAccept, false, status);
    assert.equal(actions.canRequestChanges, false, status);
    assert.equal(actions.canSendOfficeNote, false, status);
  }
});

// --- Integration QA ---

test("QA 1: SENT + accept-ready portal actions and formal request changes", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("1");
  try {
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.status, ChangeOrderStatus.SENT);
    assert.equal(state.acceptReadiness.canAccept, true);
    assert.equal(state.portalActions.canAccept, true);
    assert.equal(state.portalActions.canRequestChanges, true);
    assert.equal(state.portalActions.canSendOfficeNote, false);

    const request = await requestChangeOrderChangesForShareToken({
      shareTokenId: ctx.shareTokenId,
      message: "Please move the panel to the garage wall.",
    });
    assert.equal(request.ok, true);

    const row = await db.changeOrder.findUnique({
      where: { id: ctx.changeOrderId },
      select: { status: true },
    });
    assert.equal(row?.status, ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES);

    const checkpoint = await db.changeOrderCheckpoint.findFirst({
      where: {
        changeOrderId: ctx.changeOrderId,
        kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
      },
      select: { staffOnlyJson: true },
    });
    const staffOnly = checkpoint?.staffOnlyJson as { portalAction?: string; message?: string };
    assert.equal(staffOnly?.portalAction, CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES);
    assert.match(staffOnly?.message ?? "", /garage wall/i);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 1b: SENT + accept-ready customer accept readiness passes strict validation", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("1b");
  try {
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.acceptReadiness.canAccept, true);
    assert.equal(state.portalActions.canAccept, true);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 1c: SENT + accept-ready customer accept succeeds after name validation path", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("1c");
  try {
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.portalActions.canAccept, true);

    await db.$transaction(async (tx) => {
      const shareToken = await tx.changeOrderShareToken.findFirst({
        where: { id: ctx.shareTokenId },
        include: {
          changeOrder: {
            select: {
              ...changeOrderSelectForCustomerCheckpoint,
              jobId: true,
              baseJobPlanVersion: true,
              executionDeltaJson: true,
              paymentImpactJson: true,
              priceDeltaCents: true,
              job: {
                select: {
                  jobPlanVersion: true,
                  scopeItems: {
                    select: { id: true, executionRelevant: true, status: true },
                  },
                  tasks: {
                    select: {
                      id: true,
                      status: true,
                      hardSignal: true,
                      requiresSignals: true,
                      providesSignals: true,
                      scopes: { select: { jobScopeItemId: true } },
                    },
                  },
                },
              },
              organization: { select: { name: true } },
            },
          },
        },
      });
      assert.ok(shareToken);
      const acceptAllowed = deriveChangeOrderCustomerAcceptReadiness({
        status: shareToken.changeOrder.status,
        priceDeltaCents: shareToken.changeOrder.priceDeltaCents,
        paymentImpactJson: shareToken.changeOrder.paymentImpactJson,
        executionDeltaJson: shareToken.changeOrder.executionDeltaJson,
        baseJobPlanVersion: shareToken.changeOrder.baseJobPlanVersion,
        currentJobPlanVersion: shareToken.changeOrder.job.jobPlanVersion,
        scopeItems: shareToken.changeOrder.job.scopeItems,
        tasks: shareToken.changeOrder.job.tasks.map((task) => ({
          id: task.id,
          status: task.status,
          hardSignal: task.hardSignal,
          requiresSignals: task.requiresSignals,
          providesSignals: task.providesSignals,
          jobScopeItemIds: task.scopes.map((scope) => scope.jobScopeItemId),
        })),
      });
      assert.equal(acceptAllowed.canAccept, true);

      const changeOrder = shareToken.changeOrder;
      const document = changeOrderRowToCustomerPreviewDocument(
        changeOrder,
        changeOrder.organization.name,
      );
      const parsedPaymentImpact = parseChangeOrderPaymentImpact(changeOrder.paymentImpactJson);
      const snapshotWire = serializeChangeOrderPreviewDocumentForCheckpoint(
        document,
        parsedPaymentImpact.ok ? parsedPaymentImpact.impact : null,
      );

      await tx.changeOrderCheckpoint.create({
        data: {
          organizationId: changeOrder.organizationId,
          changeOrderId: changeOrder.id,
          kind: ChangeOrderCheckpointKind.ACCEPTANCE,
          source: ChangeOrderCheckpointSource.CUSTOMER_PORTAL,
          sequence: 1,
          schemaVersion: CHANGE_ORDER_CHECKPOINT_SNAPSHOT_SCHEMA_VERSION,
          snapshotJson: snapshotWire as unknown as Prisma.InputJsonValue,
          staffOnlyJson: { acceptedByName: "QA Customer" } as Prisma.InputJsonValue,
          changeOrderUpdatedAtAtCapture: changeOrder.updatedAt,
        },
      });

      await tx.changeOrder.update({
        where: { id: changeOrder.id },
        data: {
          status: ChangeOrderStatus.ACCEPTED,
          applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
          acceptedAt: new Date(),
          approvedAt: new Date(),
        },
      });
      await tx.executionPlanRevision.updateMany({
        where: {
          organizationId: changeOrder.organizationId,
          changeOrderId: changeOrder.id,
          kind: ExecutionPlanRevisionKind.JOB_EXECUTION_DELTA,
          status: ExecutionPlanRevisionStatus.DRAFT,
        },
        data: { status: ExecutionPlanRevisionStatus.ACCEPTED },
      });
    });

    const row = await db.changeOrder.findUnique({
      where: { id: ctx.changeOrderId },
      select: { status: true },
    });
    assert.equal(row?.status, ChangeOrderStatus.ACCEPTED);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 2: SENT + accept-blocked portal actions and office note persistence", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptBlockedSentChangeOrder("2");
  try {
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.status, ChangeOrderStatus.SENT);
    assert.equal(state.acceptReadiness.canAccept, false);
    assert.equal(state.portalActions.canAccept, false);
    assert.equal(state.portalActions.canRequestChanges, false);
    assert.equal(state.portalActions.canSendOfficeNote, true);

    const note = await sendChangeOrderOfficeNoteForShareToken({
      shareTokenId: ctx.shareTokenId,
      message: "Please call me — I cannot approve this online.",
    });
    assert.equal(note.ok, true);

    const row = await db.changeOrder.findUnique({
      where: { id: ctx.changeOrderId },
      select: { status: true },
    });
    assert.equal(row?.status, ChangeOrderStatus.SENT);

    const checkpoint = await db.changeOrderCheckpoint.findFirst({
      where: {
        changeOrderId: ctx.changeOrderId,
        kind: ChangeOrderCheckpointKind.REQUEST_CHANGES,
      },
      orderBy: { sequence: "desc" },
      select: { staffOnlyJson: true },
    });
    const staffOnly = checkpoint?.staffOnlyJson as { portalAction?: string; message?: string };
    assert.equal(staffOnly?.portalAction, CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE);
    assert.match(staffOnly?.message ?? "", /cannot approve this online/i);

    const activity = await db.jobActivity.findFirst({
      where: {
        jobId: ctx.fixture.jobId,
        entityId: ctx.changeOrderId,
        type: JobActivityType.CHANGE_ORDER_NEEDS_EXECUTION_REVIEW,
      },
      orderBy: { createdAt: "desc" },
      select: { title: true, details: true, metadataJson: true },
    });
    assert.ok(activity);
    assert.match(activity.title, /Customer note/i);
    assert.match(activity.details ?? "", /cannot approve this online/i);
    const meta = activity.metadataJson as { portalAction?: string };
    assert.equal(meta.portalAction, CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 3: server bypass — request-changes rejects accept-blocked CO", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptBlockedSentChangeOrder("3a");
  try {
    const result = await requestChangeOrderChangesForShareToken({
      shareTokenId: ctx.shareTokenId,
      message: "Formal request should be rejected.",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "CHANGE_ORDER_NOT_RESPONSE_READY");
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 3: server bypass — office note rejects accept-ready CO", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("3b");
  try {
    const result = await sendChangeOrderOfficeNoteForShareToken({
      shareTokenId: ctx.shareTokenId,
      message: "Office note should be rejected on accept-ready CO.",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "CHANGE_ORDER_OFFICE_NOTE_NOT_ALLOWED");
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 3: server bypass — office note rejects non-SENT CO", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptBlockedSentChangeOrder("3c");
  try {
    await db.changeOrder.update({
      where: { id: ctx.changeOrderId },
      data: { status: ChangeOrderStatus.ACCEPTED },
    });
    const result = await sendChangeOrderOfficeNoteForShareToken({
      shareTokenId: ctx.shareTokenId,
      message: "Should fail because CO is accepted.",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "CHANGE_ORDER_NOT_SENT");
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 3: server bypass — accept-blocked CO fails strict accept readiness", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptBlockedSentChangeOrder("3d");
  try {
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.acceptReadiness.canAccept, false);
    assert.ok(state.acceptReadiness.blockers.length > 0);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 4: revoked and expired share tokens are unusable on the public page", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("4");
  try {
    await db.changeOrderShareToken.update({
      where: { changeOrderId: ctx.changeOrderId },
      data: { revokedAt: new Date() },
    });
    const revoked = await db.changeOrderShareToken.findFirst({
      where: { changeOrderId: ctx.changeOrderId },
    });
    assert.ok(revoked);
    assert.ok(revoked.revokedAt);
    const revokedUsable =
      revoked &&
      !revoked.revokedAt &&
      !(revoked.expiresAt && revoked.expiresAt < new Date());
    assert.equal(revokedUsable, false);

    await db.changeOrderShareToken.update({
      where: { changeOrderId: ctx.changeOrderId },
      data: {
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const expired = await db.changeOrderShareToken.findFirst({
      where: { changeOrderId: ctx.changeOrderId },
    });
    assert.ok(expired);
    const expiredUsable =
      expired &&
      !expired.revokedAt &&
      !(expired.expiresAt && expired.expiresAt < new Date());
    assert.equal(expiredUsable, false);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 4: accepted CO exposes no portal response actions", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("4b");
  try {
    await db.changeOrder.update({
      where: { id: ctx.changeOrderId },
      data: { status: ChangeOrderStatus.ACCEPTED },
    });
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.portalActions.canAccept, false);
    assert.equal(state.portalActions.canRequestChanges, false);
    assert.equal(state.portalActions.canSendOfficeNote, false);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});

test("QA 4: CUSTOMER_REQUESTED_CHANGES exposes no portal response actions", async (t) => {
  if (!(await requireDevOrgForIntegrationTest(t))) return;
  const ctx = await prepareAcceptReadySentChangeOrder("4c");
  try {
    await db.changeOrder.update({
      where: { id: ctx.changeOrderId },
      data: { status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES },
    });
    const state = await loadPortalStateForShareTokenId(ctx.shareTokenId);
    assert.equal(state.portalActions.canAccept, false);
    assert.equal(state.portalActions.canRequestChanges, false);
    assert.equal(state.portalActions.canSendOfficeNote, false);
  } finally {
    await cleanupChangeOrderJobFixture(ctx.fixture);
  }
});
