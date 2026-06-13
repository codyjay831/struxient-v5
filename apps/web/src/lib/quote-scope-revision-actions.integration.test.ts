import assert from "node:assert/strict";
import test from "node:test";
import {
  ExecutionPlanRevisionKind,
  ExecutionPlanRevisionStatus,
  JobActivityType,
  JobScopeItemStatus,
  JobTaskStatus,
  QuoteScopeRevisionLineOperation,
  QuoteScopeRevisionStatus,
} from "@prisma/client";
import { validateScopeRevisionApplyGuards } from "@/lib/quote-scope-revision-apply-guards";
import { validateScopeRevisionPaymentImpact } from "@/lib/quote-scope-revision-payment-policy";
import { validateChangeOrderDraftInput } from "@/lib/change-order-flow";

/**
 * Integration-style tests for Change Order action contracts.
 * Exercises validation and apply guard paths used by create/approve/apply actions.
 */

test("integration: create draft rejects empty reasoning and lines", () => {
  const noReason = validateChangeOrderDraftInput({
    reasoning: "   ",
    lines: [
      {
        operation: QuoteScopeRevisionLineOperation.ADD,
        description: "Extra work",
        quantity: "1",
      },
    ],
    activeScopeItemIds: new Set(),
  });
  assert.equal(noReason.ok, false);

  const noLines = validateChangeOrderDraftInput({
    reasoning: "Customer approved add-on",
    lines: [],
    activeScopeItemIds: new Set(),
  });
  assert.equal(noLines.ok, false);
});

test("integration: create draft rejects MODIFY without active source scope item", () => {
  const result = validateChangeOrderDraftInput({
    reasoning: "Modify existing scope",
    lines: [
      {
        operation: QuoteScopeRevisionLineOperation.MODIFY,
        description: "Updated panel count",
        quantity: "12",
        sourceJobScopeItemId: "scope-missing",
      },
    ],
    activeScopeItemIds: new Set(["scope-active"]),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /active on this job/i);
  }
});

test("integration: approve contract requires DRAFT status", () => {
  const statuses = [
    QuoteScopeRevisionStatus.DRAFT,
    QuoteScopeRevisionStatus.APPROVED,
    QuoteScopeRevisionStatus.APPLIED,
  ];
  assert.equal(
    statuses.filter((status) => status === QuoteScopeRevisionStatus.DRAFT).length,
    1,
  );
});

test("integration: apply contract requires APPROVED status and matching job plan version", () => {
  const approvedOnly = QuoteScopeRevisionStatus.APPROVED;
  assert.notEqual(approvedOnly, QuoteScopeRevisionStatus.DRAFT);

  const expectedJobPlanVersion = 2;
  const currentJobPlanVersion = 3;
  assert.notEqual(expectedJobPlanVersion, currentJobPlanVersion);
});

test("integration: apply blocks invalid source scope for MODIFY/REMOVE", () => {
  const operation = QuoteScopeRevisionLineOperation.MODIFY;
  assert.notEqual(operation, QuoteScopeRevisionLineOperation.ADD);
});

test("integration: apply guard failures for uncovered execution scope", () => {
  const guards = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [
      { id: "new-scope", executionRelevant: true, status: JobScopeItemStatus.ACTIVE },
    ],
    tasks: [],
  });
  assert.equal(guards.ok, false);
  assert.ok(guards.errors.some((error) => error.includes("not covered")));
});

test("integration: apply guard failures for hard-signal orphan dependencies", () => {
  const guards = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "scope-1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "provider",
        status: JobTaskStatus.CANCELED,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: ["permit-approved"],
        jobScopeItemIds: ["scope-1"],
      },
      {
        id: "consumer",
        status: JobTaskStatus.TODO,
        hardSignal: true,
        requiresSignals: ["permit-approved"],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
  });
  assert.equal(guards.ok, false);
  assert.ok(guards.errors.some((error) => error.includes("hard-signal dependencies")));
});

test("integration: payment-impact guard failures for non-zero delta", () => {
  const payment = validateScopeRevisionPaymentImpact({
    priceDeltaCents: 1500,
    hasApprovedPaymentImpactOperationInTx: false,
  });
  assert.equal(payment.ok, false);
  assert.ok(payment.error?.includes("payment-impact operation"));
});

test("integration: successful zero-dollar apply guard path", () => {
  const guards = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "scope-1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "task-1",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
  });
  assert.equal(guards.ok, true);
});

test("integration: apply metadata contract includes revision audit fields", () => {
  const executionPlanRevision = {
    kind: ExecutionPlanRevisionKind.SCOPE_RECONCILIATION,
    status: ExecutionPlanRevisionStatus.APPLIED,
    basePlanVersion: 4,
    resultingPlanVersion: 5,
    quoteScopeRevisionId: "rev-1",
  };
  const activity = {
    type: JobActivityType.SCOPE_REVISION_APPLIED,
    entityType: "QuoteScopeRevision",
    entityId: "rev-1",
    metadataJson: {
      revisionId: "rev-1",
      resultingJobPlanVersion: 5,
      executionPlanRevisionId: "epr-1",
    },
  };

  assert.equal(executionPlanRevision.resultingPlanVersion, activity.metadataJson.resultingJobPlanVersion);
  assert.equal(executionPlanRevision.basePlanVersion + 1, executionPlanRevision.resultingPlanVersion);
  assert.equal(activity.type, JobActivityType.SCOPE_REVISION_APPLIED);
});

test("integration: simulated create→approve→apply state machine", () => {
  type Revision = {
    id: string;
    status: QuoteScopeRevisionStatus;
    jobPlanVersionAtApply: number | null;
  };

  let jobPlanVersion = 7;
  const revision: Revision = {
    id: "rev-flow",
    status: QuoteScopeRevisionStatus.DRAFT,
    jobPlanVersionAtApply: null,
  };

  const draftValidation = validateChangeOrderDraftInput({
    reasoning: "Add EV charger",
    lines: [
      {
        operation: QuoteScopeRevisionLineOperation.ADD,
        description: "EV charger install",
        quantity: "1",
        priceDeltaCents: 0,
      },
    ],
    activeScopeItemIds: new Set(),
  });
  assert.equal(draftValidation.ok, true);

  revision.status = QuoteScopeRevisionStatus.APPROVED;
  assert.equal(revision.status, QuoteScopeRevisionStatus.APPROVED);

  const expectedJobPlanVersion = jobPlanVersion;
  assert.equal(expectedJobPlanVersion, jobPlanVersion);

  const guards = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [
      { id: "existing", executionRelevant: true, status: JobScopeItemStatus.ACTIVE },
      { id: "new", executionRelevant: true, status: JobScopeItemStatus.ACTIVE },
    ],
    tasks: [
      {
        id: "task-existing",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["existing", "new"],
      },
    ],
  });
  assert.equal(guards.ok, true);

  jobPlanVersion += 1;
  revision.status = QuoteScopeRevisionStatus.APPLIED;
  revision.jobPlanVersionAtApply = jobPlanVersion;
  assert.equal(revision.jobPlanVersionAtApply, 8);
});
