import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHANGE_ORDER_PAYMENT_STRATEGY_LABELS,
} from "@/lib/change-order/payment-impact-schema";
import {
  buildPaymentImpactForStrategy,
  getStaffPaymentAfterApplySummary,
  humanizePaymentApplyError,
  STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE,
} from "@/lib/change-order/payment-impact-resolver";
import { buildCustomerChangeOrderDocument } from "@/lib/change-order-customer-projection";
import { buildDueBeforeAddedWorkPaymentImpact } from "@/lib/change-order/change-order-test-fixture";
import {
  deriveChangeOrderReadiness,
  getSendChangeOrderButtonState,
} from "@/lib/change-order-flow";
import {
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
  StaffRole,
} from "@prisma/client";
import { deriveChangeOrderPermissions } from "@/lib/change-order-flow";
import { parseApplyErrorSummaryForDisplay } from "@/lib/change-order/change-order-execution-projection";

test("strategy labels use contractor-simple language", () => {
  assert.equal(
    CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.DUE_BEFORE_ADDED_WORK,
    "Collect before added work starts",
  );
  assert.equal(
    CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.ADD_TO_NEXT_UNPAID_PAYMENT,
    "Add to next unpaid payment",
  );
  assert.equal(
    CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.ADD_TO_FINAL_PAYMENT,
    "Add to final payment",
  );
  assert.equal(
    CHANGE_ORDER_PAYMENT_STRATEGY_LABELS.CREDIT_REMAINING_BALANCE,
    "Credit remaining balance",
  );
});

test("before/after payment preview is included in built impact", () => {
  const built = buildPaymentImpactForStrategy({
    strategy: "ADD_TO_NEXT_UNPAID_PAYMENT",
    priceDeltaCents: 5000,
    requirements: [
      {
        id: "pay-deposit",
        title: "Deposit",
        amountCents: 50_000,
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "sched-1",
        scheduleSortOrder: 0,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        createdAt: new Date(),
      },
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.impact.resolvedPreview.targetPaymentTitle, "Deposit");
  assert.equal(built.impact.resolvedPreview.targetAmountBeforeCents, 50_000);
  assert.equal(built.impact.resolvedPreview.targetAmountAfterCents, 55_000);
});

test("customer payment terms rendering excludes internal ids", () => {
  const paymentImpact = buildDueBeforeAddedWorkPaymentImpact(5000);
  const { document } = buildCustomerChangeOrderDocument(
    {
      quoteTitle: "Solar install",
      quoteTotalCents: 100_000,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      changeOrderNumber: 1,
      changeOrderTitle: "Add battery",
      customerDocumentTitle: null,
      reasoning: "Customer requested backup",
      lines: [
        {
          id: "line-1",
          operation: ChangeOrderLineOperation.ADD,
          description: "Battery backup",
          quantity: "1",
          unitPriceCents: 5000,
          priceDeltaCents: 5000,
        },
      ],
      paymentSchedule: [],
      paymentImpact,
    },
    { organizationDisplayName: "Acme Solar" },
  );

  assert.ok(document.paymentTerms);
  assert.match(document.paymentTerms?.strategyLabel ?? "", /Collect before added work/i);
  const serialized = JSON.stringify(document.paymentTerms);
  assert.doesNotMatch(serialized, /targetPaymentRequirementId/i);
  assert.doesNotMatch(serialized, /sourceChangeOrderId/i);
});

test("send is blocked when payment impact is missing", () => {
  const state = getSendChangeOrderButtonState({
    permissions: deriveChangeOrderPermissions(StaffRole.OFFICE),
    pageBlocked: false,
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Paid add",
      priceDeltaCents: 5000,
      lines: [],
      paymentImpactJson: null,
    },
    executionValidationOk: true,
    hasGeneratedTaskSuggestions: false,
    hasUnsavedDraftChanges: false,
    unsavedDraftChangesReason: null,
    paymentImpactReady: false,
    paymentImpactBlockReason: "Choose and save how the customer will pay for this change before sending or accepting.",
    isPending: false,
  });
  assert.equal(state.disabled, true);
  assert.match(state.reason ?? "", /save how the customer will pay/i);
});

test("readiness tracks unsaved payment impact separately from commercial lines", () => {
  const readiness = deriveChangeOrderReadiness({
    permissions: deriveChangeOrderPermissions(StaffRole.OFFICE),
    pageBlocked: false,
    draftLines: [],
    reasoning: "Paid add",
    activeScopeItems: [],
    selectedRevision: {
      id: "co-1",
      status: ChangeOrderStatus.DRAFT,
      reasoning: "Paid add",
      priceDeltaCents: 5000,
      lines: [],
      paymentImpactJson: { schemaVersion: 1 },
    },
    jobPlanVersion: 3,
    expectedJobPlanVersion: 3,
    isPending: false,
    baselineReasoning: "Paid add",
    baselineLines: [],
    baselinePaymentImpactJson: null,
    paymentImpactJson: { schemaVersion: 1, strategy: "DUE_BEFORE_ADDED_WORK" },
  });
  assert.equal(readiness.paymentImpactChanged, true);
  assert.match(readiness.unsavedDraftChangesReason ?? "", /Save payment impact/i);
});

test("apply failure copy humanizes settled target errors", () => {
  const summary = parseApplyErrorSummaryForDisplay({
    classification: "INVARIANT_FAILED",
    errors: ['Next payment target "Deposit" is already paid and cannot be modified.'],
  });
  assert.match(summary.messages[0] ?? "", /already collected or closed/i);
  assert.doesNotMatch(summary.messages[0] ?? "", /targetPaymentRequirementId/i);
});

test("due-before-added-work staff note does not claim automatic task blocking", () => {
  assert.match(STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE, /not automatic yet/i);
  assert.doesNotMatch(STAFF_DUE_BEFORE_ADDED_WORK_TASK_NOTE, /automatically blocked/i);
});

test("after-apply summary describes due payment creation", () => {
  const summary = getStaffPaymentAfterApplySummary({
    strategy: "DUE_BEFORE_ADDED_WORK",
    priceDeltaCents: 15000,
    targetTitle: null,
  });
  assert.match(summary, /due payment/i);
  assert.match(summary, /\$150\.00/);
});

test("work impact panel marks legacy payment as deprecated path", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/jobs/change-order-execution-impact-panel.tsx"),
    "utf8",
  );
  assert.match(source, /Legacy payment instruction \(deprecated\)/);
  assert.doesNotMatch(source, /Pass 2 materializer/i);
  assert.doesNotMatch(source, /UPDATE_PAYMENT_REQUIREMENT/);
});

test("public preview does not claim work is automatically blocked by payment", () => {
  const source = readFileSync(
    join(process.cwd(), "src/components/jobs/change-order-public-preview.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /will not start until this payment is received/i);
  assert.doesNotMatch(source, /targetPaymentRequirementId/i);
});

test("humanizePaymentApplyError covers coexistence message", () => {
  const message = humanizePaymentApplyError(
    "Legacy UPDATE_PAYMENT_REQUIREMENT must not coexist with approved paymentImpactJson.",
  );
  assert.match(message, /approved payment terms/i);
});

test("manual QA checklist includes payment strategy scenarios", () => {
  const doc = readFileSync(
    join(process.cwd(), "../../docs/change-order-manual-qa.md"),
    "utf8",
  );
  assert.match(doc, /Collect before added work starts/i);
  assert.match(doc, /Add to next unpaid payment/i);
  assert.match(doc, /Add to final payment/i);
  assert.match(doc, /Credit remaining balance/i);
  assert.match(doc, /Customer page hides internal IDs/i);
});
