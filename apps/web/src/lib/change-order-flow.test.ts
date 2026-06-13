import assert from "node:assert/strict";
import test from "node:test";
import {
  JobScopeItemStatus,
  JobStatus,
  QuoteScopeRevisionLineOperation,
  QuoteScopeRevisionStatus,
  StaffRole,
} from "@prisma/client";
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
  getApproveButtonState,
  getCreateDraftButtonState,
  jobChangeOrdersPath,
  lineHasMeaningfulChange,
  parseDollarInputToCents,
  shouldShowJobChangeOrderLink,
  validateChangeOrderDraftInput,
  validateChangeOrderLine,
  type ChangeOrderScopeItemSnapshot,
} from "./change-order-flow";

const officePermissions = deriveChangeOrderPermissions(StaffRole.OFFICE);
const viewerPermissions = deriveChangeOrderPermissions(StaffRole.VIEWER);

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
  assert.equal(createLineFromIntent("add").operation, QuoteScopeRevisionLineOperation.ADD);
  assert.equal(createLineFromIntent("modify").operation, QuoteScopeRevisionLineOperation.MODIFY);
  assert.equal(createLineFromIntent("remove").operation, QuoteScopeRevisionLineOperation.REMOVE);
});

test("selecting source scope builds initial modify line from current scope", () => {
  const line = buildProposedLineFromSource(sampleScopeItem, QuoteScopeRevisionLineOperation.MODIFY);
  assert.equal(line.sourceJobScopeItemId, "scope-active");
  assert.equal(line.description, "New roof");
  assert.equal(line.quantity, "1");
  assert.equal(line.unitPriceCents, 1200000);
  assert.equal(line.priceDeltaCents, 0);
});

test("modify with no actual changed fields is blocked", () => {
  const line = buildProposedLineFromSource(sampleScopeItem, QuoteScopeRevisionLineOperation.MODIFY);
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
    ...buildProposedLineFromSource(sampleScopeItem, QuoteScopeRevisionLineOperation.MODIFY),
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
      operation: QuoteScopeRevisionLineOperation.REMOVE,
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
        operation: QuoteScopeRevisionLineOperation.MODIFY,
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
      buildProposedLineFromSource(sampleScopeItem, QuoteScopeRevisionLineOperation.MODIFY),
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

test("dollar input parser converts user-friendly price delta", () => {
  assert.equal(parseDollarInputToCents("500.00"), 50000);
  assert.equal(parseDollarInputToCents("$25.50"), 2550);
});

test("create draft validation succeeds for add line", () => {
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
});

test("permission-denied role sees disabled create action", () => {
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
});
