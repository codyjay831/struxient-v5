import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderLineOperation,
  ChangeOrderStatus,
  PaymentScheduleAnchorType,
} from "@prisma/client";
import { buildCustomerChangeOrderDocument } from "@/lib/change-order-customer-projection";
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

test("public change order page query does not load execution internals", () => {
  const pageSource = readFileSync(
    join(process.cwd(), "src/app/co/[token]/page.tsx"),
    "utf8",
  );
  assert.doesNotMatch(pageSource, /executionDeltaJson/);
  assert.doesNotMatch(pageSource, /lastApplyErrorJson/);
  assert.doesNotMatch(pageSource, /baseJobPlanVersion/);
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
  assert.doesNotMatch(previewSource, /applicationStatus/i);
});
