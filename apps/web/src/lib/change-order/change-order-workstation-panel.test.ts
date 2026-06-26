import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  JobScopeItemStatus,
  JobStatus,
  StaffRole,
} from "@prisma/client";
import {
  CHANGE_ORDER_WORKSTATION_STAFF_ACCEPT_LABEL,
  buildChangeOrderWorkstationPanelDto,
  resolveBlockedPrimaryActionMessage,
  resolveChangeOrderWorkstationPrimaryAction,
} from "@/lib/change-order/change-order-workstation-panel";
import { deriveChangeOrderPermissions } from "@/lib/change-order-flow";
import type {
  LoadedChangeOrder,
  LoadedChangeOrderWorkspace,
} from "@/lib/change-order-loader";
import { resolveWorkstationSelectionSurface } from "@/lib/workstation/selection-routing";
import { usesGenericPanel } from "@/lib/workstation/uses-generic-panel";
import type { WorkstationWorkItem } from "@/lib/workstation-query";
import { buildDueBeforeAddedWorkPaymentImpactJson } from "@/lib/change-order/change-order-test-fixture";
import type { ChangeOrderExecutionTaskOpView } from "@/lib/change-order/change-order-execution-projection";

const officePermissions = deriveChangeOrderPermissions(StaffRole.OFFICE);
const viewerPermissions = deriveChangeOrderPermissions(StaffRole.VIEWER);

const sampleScopeItem = {
  id: "scope-1",
  description: "Main panel",
  quantity: "1",
  unitPriceCents: 10000,
  executionRelevant: true,
  status: JobScopeItemStatus.ACTIVE,
  signedQuote: null,
  priorRevision: null,
};

function mockTaskOp(
  partial: Partial<ChangeOrderExecutionTaskOpView> = {},
): ChangeOrderExecutionTaskOpView {
  return {
    opId: "task:line-1",
    type: "ADD_TASK",
    targetEntityType: "JobTask",
    reason: "Generated",
    internalNote: "Generated from the commercial Change Order line.",
    payload: { title: "Execute change" },
    isGenerated: false,
    sourceKind: "manual_added",
    ...partial,
  };
}

const reviewedExecutionImpact = {
  parsed: true as const,
  parseErrors: [] as string[],
  summary: null,
  baseJobPlanVersion: 1,
  addedTasks: [mockTaskOp()],
  canceledTasks: [] as ChangeOrderExecutionTaskOpView[],
  modifiedTasks: [] as ChangeOrderExecutionTaskOpView[],
  paymentImpact: null,
  scopeOperationCount: 1,
  validationOk: true,
  validationErrors: [] as string[],
  stalePlan: false,
  conflict: false,
};

function makeWorkspace(
  changeOrder: LoadedChangeOrder,
  overrides: Partial<LoadedChangeOrderWorkspace> = {},
): LoadedChangeOrderWorkspace {
  return {
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    jobStatus: JobStatus.ACTIVE,
    jobPlanVersion: 1,
    quoteId: "quote-1",
    quoteTitle: "Quote",
    quoteLeadId: null,
    permissions: officePermissions,
    pageBlocked: false,
    pageBlockedMessage: null,
    activeScopeItems: [sampleScopeItem],
    jobTasks: [],
    changeOrders: [changeOrder],
    focusChangeOrderId: changeOrder.id,
    revisions: [changeOrder],
    focusRevisionId: changeOrder.id,
    jobPaymentRequirements: [],
    ...overrides,
  };
}

function makeChangeOrder(
  overrides: Partial<LoadedChangeOrder> = {},
): LoadedChangeOrder {
  return {
    id: "co-1",
    number: 1,
    title: "Panel upgrade",
    customerDocumentTitle: null,
    status: ChangeOrderStatus.DRAFT,
    reasoning: "Customer approved upgrade",
    priceDeltaCents: 5000,
    createdAt: "2026-06-01T00:00:00.000Z",
    approvedAt: null,
    appliedAt: null,
    baseJobPlanVersion: 1,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    lastApplyErrorJson: null,
    executionDeltaJson: null,
    paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
    executionImpact: reviewedExecutionImpact,
    lines: [
      {
        operation: ChangeOrderLineOperation.ADD,
        description: "Premium upgrade",
        quantity: "1",
        priceDeltaCents: 5000,
        executionRelevant: true,
      },
    ],
    ...overrides,
  };
}

const now = new Date("2026-06-18T08:00:00.000Z");

function makeWorkItem(overrides: Partial<WorkstationWorkItem>): WorkstationWorkItem {
  return {
    id: "change-order-co-1",
    kind: "change-order",
    title: "CO-001 · Panel upgrade",
    priority: "critical",
    group: "ready",
    lens: "attention",
    lane: "due",
    withinLaneRank: 1,
    filterCategory: "quotes",
    reason: "Needs attention.",
    nextStep: "Apply accepted Change Order.",
    recordId: "co-1",
    parentRecordId: "job-1",
    href: "/jobs/job-1/change-orders?focus=co-1",
    updatedAt: now,
    ...overrides,
  };
}

test("resolveWorkstationSelectionSurface routes change orders to change-order-panel", () => {
  assert.equal(
    resolveWorkstationSelectionSurface(makeWorkItem({})),
    "change-order-panel",
  );
});

test("usesGenericPanel excludes change orders", () => {
  assert.equal(usesGenericPanel(makeWorkItem({})), false);
});

test("buildChangeOrderWorkstationPanelDto returns send-ready draft panel", () => {
  const changeOrder = makeChangeOrder({ status: ChangeOrderStatus.DRAFT });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: "Jane Doe",
    customerRequestSummary: null,
    lastSentEmailAt: null,
    acceptedAt: null,
  });

  assert.equal(panel.primaryAction.kind, "send");
  if (panel.primaryAction.kind === "send") {
    assert.equal(panel.primaryAction.disabled, false);
  }
  assert.equal(panel.send.disabled, false);
  assert.equal(panel.customerLabel, "Jane Doe");
  assert.match(panel.href, /focus=co-1/);
});

test("buildChangeOrderWorkstationPanelDto returns apply-ready accepted panel", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: "Jane Doe",
    customerRequestSummary: null,
    lastSentEmailAt: null,
    acceptedAt: "2026-06-10T12:00:00.000Z",
  });

  assert.equal(panel.primaryAction.kind, "apply");
  if (panel.primaryAction.kind === "apply") {
    assert.equal(panel.primaryAction.disabled, false);
    assert.equal(panel.primaryAction.expectedJobPlanVersion, 1);
  }
  assert.equal(panel.apply.disabled, false);
});

test("buildChangeOrderWorkstationPanelDto returns blockers for incomplete draft", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    lines: [],
    priceDeltaCents: 0,
    paymentImpactJson: null,
    executionImpact: {
      ...reviewedExecutionImpact,
      validationOk: false,
      validationErrors: ["Missing execution impact"],
    },
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: null,
    customerRequestSummary: null,
    lastSentEmailAt: null,
    acceptedAt: null,
  });

  assert.equal(panel.send.disabled, true);
  assert.equal(panel.primaryAction.kind, "review_full");
  if (panel.primaryAction.kind === "review_full") {
    assert.equal(panel.primaryAction.label, "Open full change order");
  }
});

test("buildChangeOrderWorkstationPanelDto routes apply failures to review and apply", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
    lastApplyErrorJson: {
      classification: "PAYMENT_CONFLICT",
      messages: ["Target payment already settled."],
    },
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: null,
    customerRequestSummary: null,
    lastSentEmailAt: null,
    acceptedAt: null,
  });

  assert.equal(panel.primaryAction.kind, "review_full");
  if (panel.primaryAction.kind === "review_full") {
    assert.equal(panel.primaryAction.label, "Review and apply");
  }
  assert.ok(panel.applyErrorSummary);
});

test("resolveChangeOrderWorkstationPrimaryAction never returns unsafe send for accepted CO", () => {
  const action = resolveChangeOrderWorkstationPrimaryAction({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    send: { disabled: false, reason: null },
    apply: { disabled: true, reason: "Execution review required before apply." },
    staffAccept: { disabled: true, reason: null },
    expectedJobPlanVersion: 1,
    href: "/jobs/job-1/change-orders?focus=co-1",
  });

  assert.notEqual(action.kind, "send");
  assert.equal(action.kind, "review_full");
});

test("customer requested changes panel routes to review customer request", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: null,
    customerRequestSummary: "Please split the deposit.",
    lastSentEmailAt: null,
    acceptedAt: null,
  });

  assert.equal(panel.primaryAction.kind, "review_full");
  if (panel.primaryAction.kind === "review_full") {
    assert.equal(panel.primaryAction.label, "Review customer request");
  }
  assert.equal(panel.customerRequestSummary, "Please split the deposit.");
});

test("SENT price-impact CO with staff accept enabled uses staff_accept primary action", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 5000,
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: "Jane Doe",
    customerRequestSummary: null,
    lastSentEmailAt: "2026-06-12T10:00:00.000Z",
    acceptedAt: null,
  });

  assert.equal(panel.primaryAction.kind, "staff_accept");
  assert.equal(panel.staffAccept.disabled, false);
  assert.equal(CHANGE_ORDER_WORKSTATION_STAFF_ACCEPT_LABEL, "Mark internally accepted");
});

test("DRAFT price-impact CO does not use staff_accept primary action", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 5000,
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder),
    changeOrder,
    customerLabel: null,
    customerRequestSummary: null,
    lastSentEmailAt: null,
    acceptedAt: null,
  });

  assert.notEqual(panel.primaryAction.kind, "staff_accept");
});

test("SENT price-impact CO without approve permission does not use staff_accept primary action", () => {
  const changeOrder = makeChangeOrder({
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 5000,
  });
  const panel = buildChangeOrderWorkstationPanelDto({
    workspace: makeWorkspace(changeOrder, { permissions: viewerPermissions }),
    changeOrder,
    customerLabel: null,
    customerRequestSummary: null,
    lastSentEmailAt: "2026-06-12T10:00:00.000Z",
    acceptedAt: null,
  });

  assert.notEqual(panel.primaryAction.kind, "staff_accept");
  assert.equal(panel.primaryAction.kind, "open_full");
  assert.equal(panel.staffAccept.disabled, true);
});

test("resolveBlockedPrimaryActionMessage surfaces apply blocker for review and apply", () => {
  const reason = "Execution impact needs review.";
  const message = resolveBlockedPrimaryActionMessage({
    primaryAction: {
      kind: "review_full",
      label: "Review and apply",
      href: "/jobs/job-1/change-orders?focus=co-1",
      reason,
    },
    send: { disabled: true, reason: null },
    apply: { disabled: true, reason },
  });

  assert.equal(message, `Apply is not available yet: ${reason}`);
});

test("resolveBlockedPrimaryActionMessage surfaces send blocker for blocked draft", () => {
  const reason = "Save payment terms before sending.";
  const message = resolveBlockedPrimaryActionMessage({
    primaryAction: {
      kind: "review_full",
      label: "Open full change order",
      href: "/jobs/job-1/change-orders?focus=co-1",
      reason,
    },
    send: { disabled: true, reason },
    apply: { disabled: true, reason: null },
  });

  assert.equal(message, `Send is not available yet: ${reason}`);
});

test("resolveBlockedPrimaryActionMessage skips customer request review", () => {
  const message = resolveBlockedPrimaryActionMessage({
    primaryAction: {
      kind: "review_full",
      label: "Review customer request",
      href: "/jobs/job-1/change-orders?focus=co-1",
    },
    send: { disabled: true, reason: "Blocked" },
    apply: { disabled: true, reason: "Blocked" },
  });

  assert.equal(message, null);
});

test("manual QA checklist includes workstation panel scenarios", () => {
  const doc = readFileSync(
    join(process.cwd(), "../../docs/change-order-manual-qa.md"),
    "utf8",
  );
  assert.match(doc, /Workstation Sales Queue panel/i);
  assert.match(doc, /Mark internally accepted/i);
  assert.match(doc, /viewer.*no approve permission/i);
  assert.match(doc, /Apply is not available yet/i);
  assert.match(doc, /Apply-ready.*applies from the panel/i);
});
