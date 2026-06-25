import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderLineOperation, ChangeOrderStatus, StaffRole } from "@prisma/client";
import { buildDueBeforeAddedWorkPaymentImpactJson } from "@/lib/change-order/change-order-test-fixture";
import { buildNoWorkImpactExecutionDelta } from "@/lib/change-order/execution-delta-no-work-impact";
import {
  deriveChangeOrderSendBlockers,
  deriveChangeOrderSendReadiness,
} from "@/lib/change-order/change-order-send-readiness";
import { deriveChangeOrderPermissions } from "@/lib/change-order-flow";
import type { ChangeOrderExecutionImpactView } from "@/lib/change-order/change-order-execution-projection";

const officePermissions = deriveChangeOrderPermissions(StaffRole.OFFICE);

const paidLines = [
  {
    operation: ChangeOrderLineOperation.ADD,
    description: "Premium upgrade",
    quantity: "1",
    priceDeltaCents: 5000,
    executionRelevant: false,
  },
];

function baseImpact(overrides: Partial<ChangeOrderExecutionImpactView> = {}): ChangeOrderExecutionImpactView {
  return {
    parsed: true,
    parseErrors: [],
    summary: null,
    baseJobPlanVersion: 1,
    addedTasks: [],
    canceledTasks: [],
    modifiedTasks: [],
    paymentImpact: null,
    scopeOperationCount: 1,
    validationOk: true,
    validationErrors: [],
    stalePlan: false,
    conflict: false,
    noWorkImpactConfirmed: false,
    ...overrides,
  };
}

test("price-only CO blocks send until no-work-impact is confirmed", () => {
  const blockers = deriveChangeOrderSendBlockers({
    permissions: officePermissions,
    pageBlocked: false,
    isPending: false,
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Price add",
      priceDeltaCents: 5000,
      lines: paidLines,
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
      executionImpact: baseImpact(),
    },
    executionImpact: baseImpact(),
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
  });
  assert.ok(blockers.some((blocker) => blocker.code === "CONFIRM_NO_WORK_IMPACT"));
});

test("price-only CO can send after no-work-impact confirmation and saved payment", () => {
  const confirmedDelta = buildNoWorkImpactExecutionDelta({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 5000,
    reasoning: "Price add",
    lines: [
      {
        id: "line-1",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "Premium upgrade",
        quantity: "1",
        unitPriceCents: 5000,
        priceDeltaCents: 5000,
        executionRelevant: false,
      },
    ],
  });
  const impact = baseImpact({ noWorkImpactConfirmed: true, scopeOperationCount: 1 });
  const readiness = deriveChangeOrderSendReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    isPending: false,
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Price add",
      priceDeltaCents: 5000,
      lines: paidLines,
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
      executionImpact: impact,
    },
    executionImpact: impact,
    executionDeltaProposal: confirmedDelta,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
  });
  assert.equal(readiness.canSend, true);
});

test("work-impact CO blocks on generated task suggestions with actionable copy", () => {
  const blockers = deriveChangeOrderSendBlockers({
    permissions: officePermissions,
    pageBlocked: false,
    isPending: false,
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 5000,
      lines: [
        {
          operation: ChangeOrderLineOperation.ADD,
          description: "Battery",
          quantity: "1",
          priceDeltaCents: 5000,
          executionRelevant: true,
        },
      ],
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
    },
    executionImpact: baseImpact({
      addedTasks: [
        {
          opId: "task:line-1",
          type: "ADD_TASK",
          taskTitle: "Execute change: Battery",
          instructions: null,
          affectedScopeLabels: [],
          existingTaskStatus: null,
          reason: "Generated",
          internalNote: "Generated from the commercial Change Order line.",
          sourceKind: "generated",
          sourceLabel: "Draft task suggestion — office must review before sending.",
          isGenerated: true,
          validationErrors: [],
          canRemove: true,
        },
      ],
    }),
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
  });
  const generated = blockers.find((blocker) => blocker.code === "GENERATED_TASKS");
  assert.ok(generated);
  assert.match(generated?.explanation ?? "", /generated task suggestion/i);
  assert.equal(generated?.actionLabel, "Review work impact");
});

test("saved payment does not show payment blocker", () => {
  const blockers = deriveChangeOrderSendBlockers({
    permissions: officePermissions,
    pageBlocked: false,
    isPending: false,
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Price add",
      priceDeltaCents: 5000,
      lines: paidLines,
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
      executionImpact: baseImpact({ noWorkImpactConfirmed: true }),
    },
    executionImpact: baseImpact({ noWorkImpactConfirmed: true }),
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
  });
  assert.equal(
    blockers.some((blocker) => blocker.code === "PAYMENT_IMPACT"),
    false,
  );
});

test("validation failure surfaces exact error instead of generic validation message", () => {
  const blockers = deriveChangeOrderSendBlockers({
    permissions: officePermissions,
    pageBlocked: false,
    isPending: false,
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Paid add",
      priceDeltaCents: 5000,
      lines: paidLines,
      paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
    },
    executionImpact: baseImpact({
      validationOk: false,
      validationErrors: [
        "Legacy UPDATE_PAYMENT_REQUIREMENT must not coexist with approved paymentImpactJson.",
      ],
    }),
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
  });
  const validation = blockers.find((blocker) => blocker.code === "EXECUTION_VALIDATION");
  assert.ok(validation);
  assert.match(validation?.explanation ?? "", /Legacy UPDATE_PAYMENT_REQUIREMENT/i);
  assert.equal(validation?.actionLabel, "Save commercial changes");
});
