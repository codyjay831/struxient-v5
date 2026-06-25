import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderLineOperation,
  JobPaymentRequirementStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import { buildCustomerChangeOrderDocument } from "@/lib/change-order-customer-projection";
import {
  serializeChangeOrderPreviewDocumentForCheckpoint,
} from "@/lib/change-order-checkpoint-snapshot";
import { buildDueBeforeAddedWorkPaymentImpact } from "@/lib/change-order/change-order-test-fixture";
import { buildImpactForPreset } from "@/lib/change-order/payment-impact-allocation";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("customer preview document excludes internal execution fields", () => {
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
      paymentSchedule: [
        {
          id: "pay-1",
          title: "Deposit",
          amountCents: 100_000,
          anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
          anchorStageName: null,
        },
      ],
    },
    { organizationDisplayName: "Acme Solar" },
  );

  const serialized = JSON.stringify(document);
  assert.doesNotMatch(serialized, /executionDelta/i);
  assert.doesNotMatch(serialized, /internalNote/i);
  assert.doesNotMatch(serialized, /jobPlanVersion/i);
  assert.doesNotMatch(serialized, /applicationStatus/i);
  assert.doesNotMatch(serialized, /lastApplyError/i);
  assert.ok(document.lineItems.length > 0);
  assert.equal(document.deltaCents, 5000);
});

test("customer preview document includes payment terms when payment impact provided", () => {
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
  assert.match(document.paymentTerms?.customerTermsText ?? "", /due before/i);
  assert.match(document.paymentTerms?.strategyLabel ?? "", /Collect before added work/i);
  assert.equal(document.revisedTotalCents, 105_000);
});

test("customer preview document excludes internal payment impact fields", () => {
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

  const serialized = JSON.stringify(document);
  assert.doesNotMatch(serialized, /targetPaymentRequirementId/i);
  assert.doesNotMatch(serialized, /resolvedAtSendJobPlanVersion/i);
  assert.doesNotMatch(serialized, /schemaVersion/i);
  assert.doesNotMatch(serialized, /paymentImpactJson/i);
});

test("acceptance checkpoint snapshot stores payment terms", () => {
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

  const wire = serializeChangeOrderPreviewDocumentForCheckpoint(document, paymentImpact);
  assert.ok(wire.paymentImpact);
  assert.equal(wire.paymentImpact?.customerTermsText, paymentImpact.customerTermsText);
  assert.ok(wire.document.paymentTerms);
});

test("public change order page query loads paymentImpactJson for customer terms", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "src/app/co/[token]/page.tsx"),
    "utf8",
  );
  assert.match(pageSource, /paymentImpactJson:\s*true/);
});

test("public change order page uses server-side accept readiness without passing execution internals to preview", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "src/app/co/[token]/page.tsx"),
    "utf8",
  );
  assert.match(pageSource, /deriveChangeOrderCustomerAcceptReadiness/);
  assert.match(pageSource, /portalActions=\{portalActions\}/);
  assert.doesNotMatch(pageSource, /executionDeltaJson:\s*document/);
  assert.doesNotMatch(pageSource, /lastApplyErrorJson/);
  assert.doesNotMatch(pageSource, /internalNote/);
});

test("public change order preview component does not reference execution delta", () => {
  const previewSource = readFileSync(
    join(process.cwd(), "src/components/jobs/change-order-public-preview.tsx"),
    "utf8",
  );
  assert.doesNotMatch(previewSource, /executionDelta/i);
  assert.doesNotMatch(previewSource, /internalNote/i);
  assert.doesNotMatch(previewSource, /jobPlanVersion/i);
  assert.doesNotMatch(previewSource, /targetPaymentRequirementId/i);
  assert.doesNotMatch(previewSource, /will not start until this payment is received/i);
  assert.match(previewSource, /Send note to office/);
  assert.match(previewSource, /Online approval unavailable/);
  assert.doesNotMatch(previewSource, /office review/i);
  assert.doesNotMatch(previewSource, /stale plan/i);
});

test("customer preview includes allocation lines for split payment impact", () => {
  const built = buildImpactForPreset({
    preset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    priceDeltaCents: 5000,
    allocationBasis: "EQUAL_SPLIT",
    requirements: [
      {
        id: "pay-1",
        title: "Progress",
        amountCents: 40_000,
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "sched-1",
        sourceChangeOrderId: null,
        scheduleSortOrder: 0,
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        createdAt: new Date(),
      },
      {
        id: "pay-2",
        title: "Final",
        amountCents: 60_000,
        status: JobPaymentRequirementStatus.PENDING,
        sourcePaymentScheduleItemId: "sched-2",
        sourceChangeOrderId: null,
        scheduleSortOrder: 1,
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
        createdAt: new Date(),
      },
    ],
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const { document } = buildCustomerChangeOrderDocument(
    {
      quoteTitle: "Solar install",
      quoteTotalCents: 100_000,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      changeOrderNumber: 1,
      changeOrderTitle: "Add scope",
      customerDocumentTitle: null,
      reasoning: "Customer requested add",
      lines: [
        {
          id: "line-1",
          operation: ChangeOrderLineOperation.ADD,
          description: "Extra panel",
          quantity: "1",
          unitPriceCents: 5000,
          priceDeltaCents: 5000,
        },
      ],
      paymentSchedule: [],
      paymentImpact: built.impact,
    },
    { organizationDisplayName: "Acme Solar" },
  );

  assert.ok(document.paymentTerms);
  assert.ok(document.paymentTerms?.allocationLines.length);
  const serialized = JSON.stringify(document.paymentTerms);
  assert.doesNotMatch(serialized, /paymentRequirementId/i);
  assert.doesNotMatch(serialized, /pay-1/);
});

test("customer preview renders custom manual allocation lines safely", () => {
  const { document } = buildCustomerChangeOrderDocument(
    {
      quoteTitle: "Solar install",
      quoteTotalCents: 100_000,
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      changeOrderNumber: 2,
      changeOrderTitle: "Custom allocation",
      customerDocumentTitle: null,
      reasoning: "Customer requested staged payment amounts",
      lines: [
        {
          id: "line-1",
          operation: ChangeOrderLineOperation.ADD,
          description: "Extra labor",
          quantity: "1",
          unitPriceCents: 5000,
          priceDeltaCents: 5000,
        },
      ],
      paymentSchedule: [],
      paymentImpact: {
        schemaVersion: 2,
        strategy: "SPLIT_ACROSS_REMAINING_PAYMENTS",
        customerTermsText:
          "The additional $50.00 will be spread across your remaining unpaid payments. Progress: $400.00 -> $435.00 Final: $600.00 -> $615.00",
        allocationBasis: "MANUAL",
        originPreset: "SPLIT_ACROSS_REMAINING_PAYMENTS",
        originAllocationBasis: "EQUAL_SPLIT",
        allocations: [
          {
            paymentRequirementId: "pay-progress",
            title: "Progress",
            statusAtApproval: JobPaymentRequirementStatus.PENDING,
            currentAmountCents: 40_000,
            adjustmentCents: 3500,
            newAmountCents: 43_500,
          },
          {
            paymentRequirementId: "pay-final",
            title: "Final",
            statusAtApproval: JobPaymentRequirementStatus.PENDING,
            currentAmountCents: 60_000,
            adjustmentCents: 1500,
            newAmountCents: 61_500,
          },
        ],
        resolvedPreview: {
          strategyLabel: "Spread across remaining payments",
          customerSummary:
            "The additional $50.00 will be spread across your remaining unpaid payments.",
          adjustmentTotalCents: 5000,
          allocationLines: [
            {
              title: "Progress",
              currentAmountCents: 40_000,
              adjustmentCents: 3500,
              newAmountCents: 43_500,
            },
            {
              title: "Final",
              currentAmountCents: 60_000,
              adjustmentCents: 1500,
              newAmountCents: 61_500,
            },
          ],
        },
      },
    },
    { organizationDisplayName: "Acme Solar" },
  );

  assert.ok(document.paymentTerms?.allocationLines.length);
  const serializedTerms = JSON.stringify(document.paymentTerms);
  assert.doesNotMatch(serializedTerms, /paymentRequirementId/i);
  assert.doesNotMatch(serializedTerms, /originPreset/i);
  assert.doesNotMatch(serializedTerms, /originAllocationBasis/i);
  assert.doesNotMatch(serializedTerms, /MANUAL/i);
  assert.doesNotMatch(serializedTerms, /manual/i);
  assert.doesNotMatch(serializedTerms, /exclusionReason/i);
  assert.doesNotMatch(serializedTerms, /Excluded from auto split/i);
  assert.doesNotMatch(serializedTerms, /sourceChangeOrderId/i);
});
