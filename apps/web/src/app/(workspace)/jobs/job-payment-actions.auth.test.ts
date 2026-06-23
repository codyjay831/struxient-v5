import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const jobPaymentActionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "job-payment-actions.ts",
);
const source = readFileSync(jobPaymentActionsPath, "utf8");

assert.doesNotMatch(
  source,
  /requireMutableSession/,
  "job-payment-actions.ts should not use requireMutableSession",
);

assert.doesNotMatch(
  source,
  /assertExecutionPlanPermission/,
  "job-payment-actions.ts should not use assertExecutionPlanPermission",
);

assert.match(
  source,
  /requireCurrentSession/,
  "job-payment-actions.ts should use requireCurrentSession",
);

assert.match(
  source,
  /authorizeStaffAction/,
  "job-payment-actions.ts should use authorizeStaffAction",
);

assert.match(
  source,
  /STAFF_ACTIONS\.JOB_PAYMENT_REQUIREMENT_CREATE/,
  "create action should use JOB_PAYMENT_REQUIREMENT_CREATE staff action",
);

assert.match(
  source,
  /STAFF_ACTIONS\.JOB_PAYMENT_REQUIREMENT_MARK_PAID/,
  "mark paid action should use JOB_PAYMENT_REQUIREMENT_MARK_PAID staff action",
);

const markPaidIndex = source.indexOf("export async function markJobPaymentRequirementPaidAction");
const waiveIndex = source.indexOf("export async function waiveJobPaymentRequirementAction");
const cancelIndex = source.indexOf("export async function cancelJobPaymentRequirementAction");
const portalIndex = source.indexOf(
  "export async function updateJobPaymentRequirementPortalLinkAction",
);

assert.ok(markPaidIndex >= 0, "markJobPaymentRequirementPaidAction should exist");
assert.ok(waiveIndex >= 0, "waiveJobPaymentRequirementAction should exist");
assert.ok(cancelIndex >= 0, "cancelJobPaymentRequirementAction should exist");

const markPaidBody = source.slice(markPaidIndex, waiveIndex);
const waiveBody = source.slice(waiveIndex, cancelIndex);
const cancelBody = source.slice(cancelIndex, portalIndex);

assert.match(
  markPaidBody,
  /publishSignal[\s\S]*payment-cleared/,
  "mark paid should publish payment-cleared signal",
);

assert.match(
  waiveBody,
  /publishSignal[\s\S]*payment-cleared/,
  "waive should publish payment-cleared signal",
);

assert.doesNotMatch(
  cancelBody,
  /publishSignal/,
  "cancel should not publish payment-cleared signal",
);

console.log("job-payment-actions.auth.test.ts passed");
