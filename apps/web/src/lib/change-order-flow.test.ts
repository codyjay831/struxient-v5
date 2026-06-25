import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  ChangeOrderApplicationStatus,
  JobScopeItemStatus,
  JobStatus,
  StaffRole,
} from "@prisma/client";
import {
  buildDueBeforeAddedWorkPaymentImpactJson,
  buildSplitPaymentImpactJson,
} from "@/lib/change-order/change-order-test-fixture";
import {
  buildProposedLineFromSource,
  changeOrderPageBlockMessage,
  checkJobPlanVersionForApply,
  createLineFromIntent,
  deriveChangeOrderImpactPreview,
  deriveChangeOrderLineDiffs,
  deriveChangeOrderPageBlockReason,
  deriveChangeOrderPermissions,
  deriveChangeOrderReadiness,
  getApplyButtonState,
  getSendChangeOrderButtonState,
  getStaffAcceptButtonState,
  getCreateDraftButtonState,
  jobChangeOrdersPath,
  lineHasMeaningfulChange,
  parseDollarInputToCents,
  shouldShowJobChangeOrderLink,
  validateChangeOrderDraftInput,
  validateChangeOrderLine,
  type ChangeOrderScopeItemSnapshot,
} from "./change-order-flow";
import { canEditChangeOrderDraft } from "@/lib/change-order/change-order-commercial-rules";
import { CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION } from "@/lib/change-order/execution-delta-schema";
import type { ChangeOrderExecutionTaskOpView } from "@/lib/change-order/change-order-execution-projection";

const officePermissions = deriveChangeOrderPermissions(StaffRole.OFFICE);
const viewerPermissions = deriveChangeOrderPermissions(StaffRole.VIEWER);

function mockTaskOp(
  partial: Partial<ChangeOrderExecutionTaskOpView> = {},
): ChangeOrderExecutionTaskOpView {
  return {
    opId: "task:line-1",
    type: "ADD_TASK",
    taskTitle: "Execute change: Battery backup",
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
    ...partial,
  };
}

const sampleScopeItem: ChangeOrderScopeItemSnapshot = {
  id: "scope-active",
  description: "New roof",
  quantity: "1",
  unitPriceCents: 1200000,
  executionRelevant: true,
  status: JobScopeItemStatus.ACTIVE,
  signedQuote: {
    description: "New roof",
    quantity: "1",
    unitAmountCents: 1200000,
    lineTotalCents: 1200000,
    customerScopeTitle: "Roof replacement",
    customerScopeDescription: "Full tear-off and replacement",
    customerIncludedNotes: null,
    customerExcludedNotes: null,
  },
  priorRevision: null,
};

test("guided intent creates expected first line operation", () => {
  assert.equal(createLineFromIntent("add").operation, ChangeOrderLineOperation.ADD);
  assert.equal(createLineFromIntent("modify").operation, ChangeOrderLineOperation.MODIFY);
  assert.equal(createLineFromIntent("remove").operation, ChangeOrderLineOperation.REMOVE);
});

test("selecting source scope builds initial modify line from current scope", () => {
  const line = buildProposedLineFromSource(sampleScopeItem, ChangeOrderLineOperation.MODIFY);
  assert.equal(line.sourceJobScopeItemId, "scope-active");
  assert.equal(line.description, "New roof");
  assert.equal(line.quantity, "1");
  assert.equal(line.unitPriceCents, 1200000);
  assert.equal(line.priceDeltaCents, 0);
});

test("modify with no actual changed fields is blocked", () => {
  const line = buildProposedLineFromSource(sampleScopeItem, ChangeOrderLineOperation.MODIFY);
  const result = validateChangeOrderLine(
    line,
    new Set(["scope-active"]),
    new Map([["scope-active", sampleScopeItem]]),
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /must change scope/i);
  assert.equal(lineHasMeaningfulChange(line, sampleScopeItem), false);
});

test("modify with changed quantity passes validation", () => {
  const line = {
    ...buildProposedLineFromSource(sampleScopeItem, ChangeOrderLineOperation.MODIFY),
    quantity: "2",
  };
  const result = validateChangeOrderLine(
    line,
    new Set(["scope-active"]),
    new Map([["scope-active", sampleScopeItem]]),
  );
  assert.equal(result.ok, true);
});

test("remove requires source scope selection", () => {
  const result = validateChangeOrderLine(
    {
      operation: ChangeOrderLineOperation.REMOVE,
      description: "",
      quantity: "1",
      sourceJobScopeItemId: null,
    },
    new Set(["scope-active"]),
    new Map([["scope-active", sampleScopeItem]]),
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /Select the scope item you want to remove/i);
});

test("diff preview identifies changed description quantity and price fields", () => {
  const diffs = deriveChangeOrderLineDiffs({
    lines: [
      {
        operation: ChangeOrderLineOperation.MODIFY,
        sourceJobScopeItemId: "scope-active",
        description: "New roof + gutters",
        quantity: "2",
        unitPriceCents: 1300000,
        priceDeltaCents: 50000,
        executionRelevant: true,
      },
    ],
    scopeItems: [sampleScopeItem],
  });
  assert.equal(diffs.length, 1);
  assert.ok(diffs[0]?.fields.some((field) => field.label === "Description"));
  assert.ok(diffs[0]?.fields.some((field) => field.label === "Quantity"));
  assert.ok(diffs[0]?.fields.some((field) => field.label === "Unit price"));
  assert.ok(diffs[0]?.fields.some((field) => field.label === "Price delta"));
});

test("readiness panel state matches create draft disabled reason", () => {
  const readiness = deriveChangeOrderReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: [
      buildProposedLineFromSource(sampleScopeItem, ChangeOrderLineOperation.MODIFY),
    ],
    reasoning: "Customer wants more roof area",
    activeScopeItems: [sampleScopeItem],
    selectedRevision: null,
    jobPlanVersion: 3,
    expectedJobPlanVersion: 3,
    isPending: false,
  });
  assert.equal(readiness.createDraft.disabled, true);
  assert.match(readiness.createDraft.reason ?? "", /must change scope/i);
  assert.ok(readiness.executionCoverageWarning);
});

test("smoke: job page change order link routes to dedicated page", () => {
  assert.equal(jobChangeOrdersPath("job-123"), "/jobs/job-123/change-orders");
  assert.equal(
    shouldShowJobChangeOrderLink({ quoteId: "quote-1", jobStatus: JobStatus.ACTIVE }),
    true,
  );
  assert.equal(
    shouldShowJobChangeOrderLink({ quoteId: null, jobStatus: JobStatus.ACTIVE }),
    false,
  );
});

test("smoke: create draft button disabled without lines", () => {
  const state = getCreateDraftButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: [],
    reasoning: "Customer requested extra panel",
    activeScopeItemIds: new Set(["scope-1"]),
    isPending: false,
  });
  assert.equal(state.disabled, true);
  assert.match(state.reason ?? "", /At least one scope revision line/i);
});

test("smoke: send button disabled unless revision is draft", () => {
  const draftState = getSendChangeOrderButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    executionValidationOk: true,
    hasGeneratedTaskSuggestions: false,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
    isPending: false,
  });
  assert.equal(draftState.disabled, false);

  const acceptedState = getSendChangeOrderButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.ACCEPTED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    executionValidationOk: true,
    hasGeneratedTaskSuggestions: false,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
    isPending: false,
  });
  assert.equal(acceptedState.disabled, true);
  assert.match(acceptedState.reason ?? "", /Only editable Change Orders/i);
});

test("price-impact draft cannot be staff-accepted", () => {
  const state = getStaffAcceptButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Upgrade",
      priceDeltaCents: 5000,
      lines: [],
    },
    isPending: false,
  });
  assert.equal(state.disabled, true);
  assert.match(state.reason ?? "", /sent to the customer/i);
});

test("zero-dollar draft can be staff-accepted", () => {
  const state = getStaffAcceptButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Clarify scope",
      priceDeltaCents: 0,
      lines: [],
    },
    isPending: false,
  });
  assert.equal(state.disabled, false);
});

test("apply button disabled when applicationStatus is APPLY_FAILED", () => {
  const state = getApplyButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.ACCEPTED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    jobPlanVersion: 4,
    expectedJobPlanVersion: 4,
    executionValidationOk: true,
    applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
    isPending: false,
  });
  assert.equal(state.disabled, true);
  assert.match(state.reason ?? "", /Apply failed/i);
});

test("readiness exposes NEEDS_EXECUTION_REVIEW lifecycle state", () => {
  const readiness = deriveChangeOrderReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: [],
    reasoning: "",
    activeScopeItems: [sampleScopeItem],
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.ACCEPTED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [
        {
          operation: ChangeOrderLineOperation.ADD,
          description: "Battery backup",
          quantity: "1",
          executionRelevant: true,
        },
      ],
      applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
      executionImpact: {
        parsed: true,
        parseErrors: [],
        summary: null,
        baseJobPlanVersion: 1,
        addedTasks: [],
        canceledTasks: [],
        modifiedTasks: [],
        paymentImpact: null,
        scopeOperationCount: 1,
        validationOk: false,
        validationErrors: ["Job plan changed"],
        stalePlan: true,
        conflict: false,
      },
    },
    jobPlanVersion: 2,
    expectedJobPlanVersion: 1,
    isPending: false,
  });
  assert.equal(readiness.lifecycleReadiness, "ACCEPTED_NEEDS_EXECUTION_REVIEW");
  assert.match(readiness.lifecycleReadinessLabel ?? "", /execution review/i);
});

test("smoke: apply button disabled unless revision is approved", () => {
  const approvedState = getApplyButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.ACCEPTED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [
        {
          operation: ChangeOrderLineOperation.ADD,
          description: "Battery backup",
          quantity: "1",
          executionRelevant: true,
        },
      ],
    },
    jobPlanVersion: 4,
    expectedJobPlanVersion: 4,
    executionValidationOk: true,
    isPending: false,
  });
  assert.equal(approvedState.disabled, false);
});

test("smoke: stale jobPlanVersion apply conflict shows retry message", () => {
  const versionCheck = checkJobPlanVersionForApply({
    expectedJobPlanVersion: 2,
    currentJobPlanVersion: 3,
  });
  assert.equal(versionCheck.ok, false);
  assert.match(versionCheck.error ?? "", /Job plan changed/i);
});

test("change order page blocks archived jobs and missing quotes", () => {
  assert.equal(
    deriveChangeOrderPageBlockReason({
      quoteId: null,
      jobStatus: JobStatus.ACTIVE,
      permissions: officePermissions,
    }),
    "missing_quote",
  );
  assert.match(changeOrderPageBlockMessage("missing_quote"), /no linked quote/i);
});

test("change order impact preview flags non-zero payment delta without payment impact", () => {
  const preview = deriveChangeOrderImpactPreview({
    lines: [
      {
        operation: ChangeOrderLineOperation.ADD,
        description: "Premium upgrade",
        quantity: "1",
        priceDeltaCents: 5000,
      },
    ],
    priceDeltaCents: 5000,
  });
  assert.equal(preview.paymentBlocked, true);
  assert.ok(preview.paymentBlockReason);
});

test("change order impact preview clears payment block when payment impact is valid", () => {
  const preview = deriveChangeOrderImpactPreview({
    lines: [
      {
        operation: ChangeOrderLineOperation.ADD,
        description: "Premium upgrade",
        quantity: "1",
        priceDeltaCents: 5000,
      },
    ],
    priceDeltaCents: 5000,
    paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
  });
  assert.equal(preview.paymentBlocked, false);
});

test("dollar input parser converts user-friendly price delta", () => {
  assert.equal(parseDollarInputToCents("500.00"), 50000);
  assert.equal(parseDollarInputToCents("$25.50"), 2550);
});

test("create draft validation succeeds for add line", () => {
  const validation = validateChangeOrderDraftInput({
    reasoning: "Customer approved battery add-on",
    lines: [
      {
        operation: ChangeOrderLineOperation.ADD,
        description: "Battery backup",
        quantity: "1",
        priceDeltaCents: 0,
        executionRelevant: true,
      },
    ],
    activeScopeItemIds: new Set(["scope-1"]),
  });
  assert.equal(validation.ok, true);
});

test("permission-denied role sees disabled create action", () => {
  const createState = getCreateDraftButtonState({
    permissions: viewerPermissions,
    pageBlocked: false,
    draftLines: [
      {
        operation: ChangeOrderLineOperation.ADD,
        description: "Extra work",
        quantity: "1",
      },
    ],
    reasoning: "Customer request",
    activeScopeItemIds: new Set(),
    isPending: false,
  });
  assert.equal(createState.disabled, true);
  assert.match(createState.reason ?? "", /permission/i);
});

test("lifecycle editability: DRAFT and CUSTOMER_REQUESTED_CHANGES editable; SENT and ACCEPTED read-only", () => {
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.DRAFT).ok, true);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES).ok, true);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.SENT).ok, false);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.ACCEPTED).ok, false);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.APPLIED).ok, false);
});

test("mixed commercial and execution edits disable update draft with explicit reason", () => {
  const baselineLines = [
    {
      operation: ChangeOrderLineOperation.ADD,
      description: "Battery backup",
      quantity: "1",
      executionRelevant: true,
    },
  ];
  const baselineProposal = {
    schemaVersion: CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
    baseJobPlanVersion: 1,
    operations: [
      {
        opId: "task:line-1",
        type: "ADD_TASK" as const,
        targetEntityType: "JobTask" as const,
        reason: "Generated",
        internalNote: "Generated from the commercial Change Order line.",
        payload: { title: "Execute change: Battery backup" },
      },
    ],
  };

  const readiness = deriveChangeOrderReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: [
      {
        operation: ChangeOrderLineOperation.ADD,
        description: "Battery backup XL",
        quantity: "1",
        executionRelevant: true,
      },
    ],
    reasoning: "Customer approved battery add-on",
    activeScopeItems: [sampleScopeItem],
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Customer approved battery add-on",
      priceDeltaCents: 0,
      lines: baselineLines,
      executionImpact: {
        parsed: true,
        parseErrors: [],
        summary: null,
        baseJobPlanVersion: 1,
        addedTasks: [mockTaskOp()],
        canceledTasks: [],
        modifiedTasks: [],
        paymentImpact: null,
        scopeOperationCount: 1,
        validationOk: true,
        validationErrors: [],
        stalePlan: false,
        conflict: false,
      },
    },
    jobPlanVersion: 1,
    expectedJobPlanVersion: 1,
    isPending: false,
    baselineReasoning: "Customer approved battery add-on",
    baselineLines,
    baselineExecutionProposal: baselineProposal,
    currentExecutionProposal: {
      ...baselineProposal,
      operations: baselineProposal.operations.map((operation) => ({
        ...operation,
        internalNote: "Reviewed by office.",
      })),
    },
  });

  assert.equal(readiness.mixedEditBlocked, true);
  assert.equal(readiness.saveCommercial.disabled, true);
  assert.equal(readiness.saveExecutionImpact.disabled, true);
  assert.match(readiness.saveCommercial.reason ?? "", /Save commercial changes first/i);
});

const paidCommercialLines = [
  {
    operation: ChangeOrderLineOperation.ADD,
    description: "Premium upgrade",
    quantity: "1",
    priceDeltaCents: 5000,
    executionRelevant: true,
  },
];

const reviewedExecutionImpact = {
  parsed: true as const,
  parseErrors: [] as string[],
  summary: null,
  baseJobPlanVersion: 1,
  addedTasks: [mockTaskOp({ isGenerated: false, sourceKind: "manual_added" })],
  canceledTasks: [] as ChangeOrderExecutionTaskOpView[],
  modifiedTasks: [] as ChangeOrderExecutionTaskOpView[],
  paymentImpact: null,
  scopeOperationCount: 1,
  validationOk: true,
  validationErrors: [] as string[],
  stalePlan: false,
  conflict: false,
};

test("unsaved v2 payment impact enables commercial save and blocks send", () => {
  const selectedPaymentImpact = buildSplitPaymentImpactJson({
    priceDeltaCents: 5000,
    depositRequirementId: "dep-req",
    finalRequirementId: "fin-req",
  });
  const readiness = deriveChangeOrderReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: paidCommercialLines,
    reasoning: "Customer approved upgrade",
    activeScopeItems: [sampleScopeItem],
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Customer approved upgrade",
      priceDeltaCents: 5000,
      lines: paidCommercialLines,
      paymentImpactJson: null,
      executionImpact: reviewedExecutionImpact,
    },
    jobPlanVersion: 1,
    expectedJobPlanVersion: 1,
    isPending: false,
    baselineReasoning: "Customer approved upgrade",
    baselineLines: paidCommercialLines,
    baselinePaymentImpactJson: null,
    paymentImpactJson: selectedPaymentImpact,
    baselineExecutionProposal: null,
    currentExecutionProposal: null,
  });

  assert.equal(readiness.paymentImpactChanged, true);
  assert.equal(readiness.saveCommercial.disabled, false);
  assert.equal(readiness.send.disabled, true);
  assert.match(readiness.send.reason ?? "", /Save payment impact before sending/i);
  assert.match(readiness.unsavedDraftChangesReason ?? "", /Save payment impact before sending/i);
});

test("saved payment impact clears unsaved send blocker when execution is reviewed", () => {
  const savedPaymentImpact = buildDueBeforeAddedWorkPaymentImpactJson(5000);
  const readiness = deriveChangeOrderReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: paidCommercialLines,
    reasoning: "Customer approved upgrade",
    activeScopeItems: [sampleScopeItem],
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Customer approved upgrade",
      priceDeltaCents: 5000,
      lines: paidCommercialLines,
      paymentImpactJson: savedPaymentImpact,
      executionImpact: reviewedExecutionImpact,
    },
    jobPlanVersion: 1,
    expectedJobPlanVersion: 1,
    isPending: false,
    baselineReasoning: "Customer approved upgrade",
    baselineLines: paidCommercialLines,
    baselinePaymentImpactJson: savedPaymentImpact,
    paymentImpactJson: savedPaymentImpact,
    baselineExecutionProposal: null,
    currentExecutionProposal: null,
  });

  assert.equal(readiness.paymentImpactChanged, false);
  assert.equal(readiness.paymentImpactReady, true);
  assert.equal(readiness.unsavedDraftChangesReason, null);
  assert.equal(readiness.send.disabled, false);
});

test("unsaved execution impact blocks send", () => {
  const state = getSendChangeOrderButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    executionValidationOk: true,
    hasGeneratedTaskSuggestions: false,
    hasUnsavedDraftChanges: true,
    unsavedDraftChangesReason: "Save execution impact before sending.",
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
    isPending: false,
  });
  assert.equal(state.disabled, true);
  assert.match(state.reason ?? "", /Save execution impact before sending/i);
});

test("generated task suggestions keep send action disabled until reviewed", () => {
  const readiness = deriveChangeOrderReadiness({
    permissions: officePermissions,
    pageBlocked: false,
    draftLines: [],
    reasoning: "",
    activeScopeItems: [sampleScopeItem],
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [
        {
          operation: ChangeOrderLineOperation.ADD,
          description: "Battery backup",
          quantity: "1",
          executionRelevant: true,
        },
      ],
      executionImpact: {
        parsed: true,
        parseErrors: [],
        summary: null,
        baseJobPlanVersion: 1,
        addedTasks: [mockTaskOp()],
        canceledTasks: [],
        modifiedTasks: [],
        paymentImpact: null,
        scopeOperationCount: 1,
        validationOk: true,
        validationErrors: [],
        stalePlan: false,
        conflict: false,
      },
    },
    jobPlanVersion: 1,
    expectedJobPlanVersion: 1,
    isPending: false,
  });

  assert.equal(readiness.send.disabled, true);
  assert.match(readiness.send.reason ?? "", /generated task suggestions/i);
});

test("invalid execution impact blocks send", () => {
  const state = getSendChangeOrderButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
      executionImpact: {
        parsed: true,
        parseErrors: [],
        summary: null,
        baseJobPlanVersion: 1,
        addedTasks: [],
        canceledTasks: [],
        modifiedTasks: [],
        paymentImpact: null,
        scopeOperationCount: 0,
        validationOk: false,
        validationErrors: ["Completed tasks cannot be canceled by Change Order delta."],
        stalePlan: false,
        conflict: false,
        noWorkImpactConfirmed: false,
      },
    },
    executionValidationOk: false,
    hasGeneratedTaskSuggestions: false,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: true,
    paymentImpactBlockReason: null,
    isPending: false,
  });
  assert.equal(state.disabled, true);
  assert.match(state.reason ?? "", /Fix work impact errors/i);
});
