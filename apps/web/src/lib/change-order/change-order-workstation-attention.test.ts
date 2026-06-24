import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderStatus,
} from "@prisma/client";
import { deriveChangeOrderWorkstationAttention } from "./change-order-workstation-attention";

test("workstation attention surfaces SENT waiting state", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.SENT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  assert.match(attention.statusLabel, /SENT/i);
  assert.match(attention.nextStep, /customer acceptance/i);
});

test("workstation attention surfaces CUSTOMER_REQUESTED_CHANGES", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  assert.match(attention.statusLabel, /requested/i);
  assert.equal(attention.lens, "attention");
});

test("workstation attention surfaces ACCEPTED ready to apply", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  assert.match(attention.nextStep, /Apply accepted/i);
  assert.equal(attention.priority, "critical");
});

test("workstation attention surfaces NEEDS_EXECUTION_REVIEW", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
  });
  assert.match(attention.statusLabel, /execution review/i);
  assert.equal(attention.lens, "attention");
});

test("workstation attention surfaces APPLY_FAILED", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
  });
  assert.match(attention.statusLabel, /apply failed/i);
  assert.match(attention.nextStep, /failed/i);
});
