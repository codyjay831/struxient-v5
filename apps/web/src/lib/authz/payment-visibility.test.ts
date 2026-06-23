import assert from "node:assert/strict";
import { JobActivityType, StaffRole } from "@prisma/client";
import {
  canReadPaymentDetails,
  EXECUTION_PAYMENT_HOLD_LABEL,
  FIELD_PAYMENT_HOLD_REASON,
  formatPaymentHoldMessage,
  getWorkstationPaymentHoldLabel,
  redactPaymentActivityForRole,
  sanitizeExecutionHealthForRole,
  sanitizeTaskPaymentHoldForRole,
} from "./payment-visibility";
import type { ExecutionHealthResult } from "@/lib/job-execution-health";

for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE, StaffRole.VIEWER] as const) {
  assert.equal(canReadPaymentDetails(role), true, `${role} should read payment details`);
}

for (const role of [StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
  assert.equal(canReadPaymentDetails(role), false, `${role} should not read payment details`);
}

const commercialHold = {
  requirementId: "req-1",
  title: "Deposit",
  reason: "Payment required before work in this stage.",
};

const fieldHold = sanitizeTaskPaymentHoldForRole(commercialHold, StaffRole.FIELD);
assert.ok(fieldHold);
assert.equal(fieldHold.title, "");
assert.equal(fieldHold.reason, FIELD_PAYMENT_HOLD_REASON);
assert.equal(sanitizeTaskPaymentHoldForRole(commercialHold, StaffRole.OFFICE), commercialHold);

assert.equal(getWorkstationPaymentHoldLabel("Deposit", StaffRole.FIELD), EXECUTION_PAYMENT_HOLD_LABEL);
assert.equal(getWorkstationPaymentHoldLabel("Deposit", StaffRole.OFFICE), "Deposit");
assert.equal(getWorkstationPaymentHoldLabel(undefined, StaffRole.FIELD), undefined);

const paymentBlockedHealth: ExecutionHealthResult = {
  primaryState: "BLOCKED_BY_PAYMENT",
  severity: "blocker",
  headline: "Payment required",
  detail: "A payment is due before work can continue on this job.",
  recommendedNextAction: { type: "record_payment", label: "Record payment", targetId: "req-1" },
  blockers: [{ kind: "payment", entityId: "req-1", label: "Deposit", nextActionLabel: "Record or waive payment" }],
  warnings: [],
  nextActionableMainTaskId: null,
  nextActionableRecoveryTaskId: null,
  invariantSatisfied: true,
};

const fieldHealth = sanitizeExecutionHealthForRole(paymentBlockedHealth, StaffRole.FIELD);
assert.equal(fieldHealth.headline, "Work blocked by payment");
assert.equal(fieldHealth.recommendedNextAction.type, "none");
assert.equal(fieldHealth.blockers[0]?.label, EXECUTION_PAYMENT_HOLD_LABEL);

const officeHealth = sanitizeExecutionHealthForRole(paymentBlockedHealth, StaffRole.OFFICE);
assert.equal(officeHealth.headline, "Payment required");

const paidActivity = redactPaymentActivityForRole(
  {
    type: JobActivityType.PAYMENT_REQUIREMENT_PAID,
    title: "Payment recorded: Deposit",
    details: "Amount: $500.00",
  },
  StaffRole.FIELD,
);
assert.equal(paidActivity.details, null);
assert.equal(paidActivity.title, "Payment recorded");
assert.equal(
  redactPaymentActivityForRole(
    {
      type: JobActivityType.PAYMENT_REQUIREMENT_PAID,
      title: "Payment recorded: Deposit",
      details: "Amount: $500.00",
    },
    StaffRole.OFFICE,
  ).details,
  "Amount: $500.00",
);

assert.equal(
  formatPaymentHoldMessage({ requirementId: "r", title: "", reason: FIELD_PAYMENT_HOLD_REASON }),
  FIELD_PAYMENT_HOLD_REASON,
);
assert.match(
  formatPaymentHoldMessage(commercialHold),
  /Deposit/,
);

console.log("payment-visibility.test.ts passed");
