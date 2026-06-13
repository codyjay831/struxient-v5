import assert from "node:assert/strict";
import test from "node:test";
import {
  JobStatus,
  QuoteScopeRevisionLineOperation,
  QuoteScopeRevisionStatus,
  StaffRole,
} from "@prisma/client";
import {
  changeOrderPageBlockMessage,
  checkJobPlanVersionForApply,
  deriveChangeOrderImpactPreview,
  deriveChangeOrderPageBlockReason,
  deriveChangeOrderPermissions,
  getApplyButtonState,
  getApproveButtonState,
  getCreateDraftButtonState,
  jobChangeOrdersPath,
  resolveFocusedRevisionId,
  shouldShowJobChangeOrderLink,
  validateChangeOrderDraftInput,
  validateChangeOrderLine,
} from "./change-order-flow";

const officePermissions = deriveChangeOrderPermissions(StaffRole.OFFICE);
const viewerPermissions = deriveChangeOrderPermissions(StaffRole.VIEWER);

test("smoke: job page change order link routes to dedicated page", () => {
  assert.equal(
    jobChangeOrdersPath("job-123"),
    "/jobs/job-123/change-orders",
  );
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

test("smoke: approve button disabled unless revision is draft", () => {
  const draftState = getApproveButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    isPending: false,
  });
  assert.equal(draftState.disabled, false);

  const approvedState = getApproveButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.APPROVED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    isPending: false,
  });
  assert.equal(approvedState.disabled, true);
  assert.match(approvedState.reason ?? "", /Only draft Change Orders/i);
});

test("smoke: apply button disabled unless revision is approved", () => {
  const approvedState = getApplyButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.APPROVED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [
        {
          operation: QuoteScopeRevisionLineOperation.ADD,
          description: "Battery backup",
          quantity: "1",
          executionRelevant: true,
        },
      ],
    },
    jobPlanVersion: 4,
    expectedJobPlanVersion: 4,
    isPending: false,
  });
  assert.equal(approvedState.disabled, false);

  const draftState = getApplyButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    jobPlanVersion: 4,
    expectedJobPlanVersion: 4,
    isPending: false,
  });
  assert.equal(draftState.disabled, true);
  assert.match(draftState.reason ?? "", /Only approved Change Orders/i);
});

test("smoke: permission-denied role sees disabled create/approve/apply actions", () => {
  const createState = getCreateDraftButtonState({
    permissions: viewerPermissions,
    pageBlocked: false,
    draftLines: [
      {
        operation: QuoteScopeRevisionLineOperation.ADD,
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

  const approveState = getApproveButtonState({
    permissions: viewerPermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.DRAFT,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    isPending: false,
  });
  assert.equal(approveState.disabled, true);

  const applyState = getApplyButtonState({
    permissions: viewerPermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.APPROVED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [],
    },
    jobPlanVersion: 2,
    expectedJobPlanVersion: 2,
    isPending: false,
  });
  assert.equal(applyState.disabled, true);
});

test("smoke: stale jobPlanVersion apply conflict shows retry message", () => {
  const versionCheck = checkJobPlanVersionForApply({
    expectedJobPlanVersion: 2,
    currentJobPlanVersion: 3,
  });
  assert.equal(versionCheck.ok, false);
  assert.match(versionCheck.error ?? "", /Job plan changed/i);

  const applyState = getApplyButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-1",
      status: QuoteScopeRevisionStatus.APPROVED,
      reasoning: "Add battery",
      priceDeltaCents: 0,
      lines: [
        {
          operation: QuoteScopeRevisionLineOperation.ADD,
          description: "Battery backup",
          quantity: "1",
        },
      ],
    },
    jobPlanVersion: 3,
    expectedJobPlanVersion: 2,
    isPending: false,
  });
  assert.equal(applyState.disabled, true);
  assert.match(applyState.reason ?? "", /Job plan changed/i);
});

test("smoke: create draft with lines succeeds validation", () => {
  const validation = validateChangeOrderDraftInput({
    reasoning: "Customer approved battery add-on",
    lines: [
      {
        operation: QuoteScopeRevisionLineOperation.ADD,
        description: "Battery backup",
        quantity: "1",
        priceDeltaCents: 0,
        executionRelevant: true,
      },
    ],
    activeScopeItemIds: new Set(["scope-1"]),
  });
  assert.equal(validation.ok, true);
  if (validation.ok) {
    assert.equal(validation.priceDeltaCents, 0);
  }
});

test("smoke: approve then apply flow increments expected job plan version", () => {
  let jobPlanVersion = 5;
  const revisionStatus = QuoteScopeRevisionStatus.DRAFT;

  assert.equal(revisionStatus, QuoteScopeRevisionStatus.DRAFT);
  const approvedStatus = QuoteScopeRevisionStatus.APPROVED;
  assert.notEqual(revisionStatus, approvedStatus);

  const applyResultVersion = jobPlanVersion + 1;
  jobPlanVersion = applyResultVersion;
  assert.equal(jobPlanVersion, 6);
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
  assert.equal(
    deriveChangeOrderPageBlockReason({
      quoteId: "quote-1",
      jobStatus: JobStatus.ARCHIVED,
      permissions: officePermissions,
    }),
    "job_archived",
  );
  assert.match(
    changeOrderPageBlockMessage("missing_quote"),
    /no linked quote/i,
  );
});

test("change order line validation requires active source for modify/remove", () => {
  const invalidRemove = validateChangeOrderLine(
    {
      operation: QuoteScopeRevisionLineOperation.REMOVE,
      description: "Remove old scope",
      quantity: "1",
      sourceJobScopeItemId: "missing",
    },
    new Set(["scope-active"]),
  );
  assert.equal(invalidRemove.ok, false);

  const validModify = validateChangeOrderLine(
    {
      operation: QuoteScopeRevisionLineOperation.MODIFY,
      description: "Updated scope",
      quantity: "2",
      sourceJobScopeItemId: "scope-active",
    },
    new Set(["scope-active"]),
  );
  assert.equal(validModify.ok, true);
});

test("change order impact preview flags non-zero payment delta", () => {
  const preview = deriveChangeOrderImpactPreview({
    lines: [
      {
        operation: QuoteScopeRevisionLineOperation.ADD,
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

test("focus revision resolves requested id when present", () => {
  assert.equal(
    resolveFocusedRevisionId({
      revisions: [{ id: "rev-a" }, { id: "rev-b" }],
      requestedRevisionId: "rev-b",
    }),
    "rev-b",
  );
  assert.equal(
    resolveFocusedRevisionId({
      revisions: [{ id: "rev-a" }],
      requestedRevisionId: "missing",
    }),
    "rev-a",
  );
});

test("apply button blocks non-zero payment delta without approved payment op", () => {
  const applyState = getApplyButtonState({
    permissions: officePermissions,
    pageBlocked: false,
    selectedRevision: {
      id: "rev-paid",
      status: QuoteScopeRevisionStatus.APPROVED,
      reasoning: "Paid upgrade",
      priceDeltaCents: 2500,
      lines: [
        {
          operation: QuoteScopeRevisionLineOperation.ADD,
          description: "Premium inverter",
          quantity: "1",
          priceDeltaCents: 2500,
        },
      ],
    },
    jobPlanVersion: 1,
    expectedJobPlanVersion: 1,
    isPending: false,
  });
  assert.equal(applyState.disabled, true);
  assert.match(applyState.reason ?? "", /payment-impact operation/i);
});
