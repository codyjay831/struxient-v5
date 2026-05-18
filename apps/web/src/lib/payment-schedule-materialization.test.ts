import assert from "node:assert/strict";
import test from "node:test";
import { PaymentScheduleAnchorType } from "@prisma/client";
import {
  materializePaymentScheduleForActivation,
  materializePercentageToCents,
  resolveNonFinalScheduleItemCents,
  validatePaymentScheduleForActivation,
  type PaymentScheduleItemForMaterialization,
} from "./payment-schedule-materialization";

function item(
  overrides: Partial<PaymentScheduleItemForMaterialization> &
    Pick<PaymentScheduleItemForMaterialization, "id" | "title" | "anchorType">,
): PaymentScheduleItemForMaterialization {
  return {
    amountCents: null,
    percentage: null,
    ...overrides,
  };
}

test("materializePercentageToCents: 30% of $10,000", () => {
  const result = materializePercentageToCents(1_000_000, "30");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountCents, 300_000);
  }
});

test("materializePercentageToCents: half-up rounding", () => {
  const result = materializePercentageToCents(10_000, "33.33");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountCents, 3333);
  }
});

test("resolveNonFinalScheduleItemCents: amountCents wins over percentage", () => {
  const result = resolveNonFinalScheduleItemCents(
    {
      title: "Deposit",
      amountCents: 5_000,
      percentage: "30",
    },
    1_000_000,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountCents, 5_000);
  }
});

test("resolveNonFinalScheduleItemCents: percentage-only milestone", () => {
  const result = resolveNonFinalScheduleItemCents(
    {
      title: "Deposit",
      amountCents: null,
      percentage: "30",
    },
    1_000_000,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.amountCents, 300_000);
  }
});

test("resolveNonFinalScheduleItemCents: rejects missing amount and percentage", () => {
  const result = resolveNonFinalScheduleItemCents(
    {
      title: "Mystery",
      amountCents: null,
      percentage: null,
    },
    1_000_000,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "PAYMENT_MILESTONE_MISSING_AMOUNT");
  }
});

test("validatePaymentScheduleForActivation: percentage-only without FINAL_BALANCE is valid", () => {
  const errors = validatePaymentScheduleForActivation(
    [
      item({
        id: "1",
        title: "Deposit",
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        percentage: "30",
      }),
    ],
    1_000_000,
  );
  assert.equal(errors.length, 0);
});

test("materializePaymentScheduleForActivation: percentage deposit + final balance", () => {
  const result = materializePaymentScheduleForActivation(
    [
      item({
        id: "dep",
        title: "Deposit",
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        percentage: "30",
      }),
      item({
        id: "final",
        title: "Final",
        anchorType: PaymentScheduleAnchorType.FINAL_BALANCE,
      }),
    ],
    1_000_000,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    const deposit = result.items.find((i) => i.id === "dep");
    const final = result.items.find((i) => i.id === "final");
    assert.equal(deposit?.amountCents, 300_000);
    assert.equal(final?.amountCents, 700_000);
    assert.equal(
      result.items.reduce((sum, i) => sum + i.amountCents, 0),
      1_000_000,
    );
  }
});

test("materializePaymentScheduleForActivation: percentage-only without final row", () => {
  const result = materializePaymentScheduleForActivation(
    [
      item({
        id: "dep",
        title: "Deposit",
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        percentage: "30",
      }),
    ],
    1_000_000,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].amountCents, 300_000);
  }
});

test("validatePaymentScheduleForActivation: non-final sum exceeding quote total", () => {
  const errors = validatePaymentScheduleForActivation(
    [
      item({
        id: "1",
        title: "A",
        anchorType: PaymentScheduleAnchorType.UPON_APPROVAL,
        amountCents: 600_000,
      }),
      item({
        id: "2",
        title: "B",
        anchorType: PaymentScheduleAnchorType.BEFORE_STAGE,
        amountCents: 500_000,
      }),
    ],
    1_000_000,
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, "PAYMENT_SCHEDULE_EXCEEDS_QUOTE_TOTAL");
});

test("materializePaymentScheduleForActivation: empty schedule", () => {
  const result = materializePaymentScheduleForActivation([], 1_000_000);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.items.length, 0);
  }
});
