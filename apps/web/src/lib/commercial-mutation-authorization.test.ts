import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { StaffRole } from "@prisma/client";
import {
  assertExecutionPlanPermission,
} from "@/lib/execution-plan-permissions";
import {
  denyUnlessCanManageCommercial,
  denyUnlessCanReadCommercial,
} from "@/lib/staff-authz";
import {
  authorizeLoadedJobPaymentAction,
  STAFF_ACTIONS,
  type StaffActor,
} from "@/lib/authz/staff-actions";
import { denyUnlessCanSendQuoteSignature } from "@/lib/quote-signature/permissions";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readSrc(relativePath: string) {
  return readFileSync(path.join(srcDir, relativePath), "utf8");
}

function actor(role: StaffRole): StaffActor {
  return { organizationId: "org_1", userId: `user_${role}`, role };
}

test("commercial read and mutation authority are separate", () => {
  assert.equal(denyUnlessCanReadCommercial(StaffRole.VIEWER), null);

  for (const role of [StaffRole.VIEWER, StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
    assert.equal(
      denyUnlessCanManageCommercial(role),
      "You do not have permission to perform this action.",
      `${role} must not mutate commercial records`,
    );
  }

  for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE] as const) {
    assert.equal(denyUnlessCanManageCommercial(role), null, `${role} should mutate commercial records`);
  }
});

test("quote signature staff mutations require commercial mutation authority", () => {
  for (const role of [StaffRole.VIEWER, StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
    assert.notEqual(denyUnlessCanSendQuoteSignature(role), null);
  }

  for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE] as const) {
    assert.equal(denyUnlessCanSendQuoteSignature(role), null);
  }
});

test("payment requirement staff mutations reject non-commercial roles", () => {
  const resource = { id: "pay_1" };

  for (const role of [StaffRole.VIEWER, StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
    const result = authorizeLoadedJobPaymentAction(
      actor(role),
      STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
      resource,
      "Payment requirement",
    );
    assert.equal(result.ok, false, `${role} should not mutate payment requirements`);
  }

  for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE] as const) {
    const result = authorizeLoadedJobPaymentAction(
      actor(role),
      STAFF_ACTIONS.JOB_PAYMENT_REQUIREMENT_MARK_PAID,
      resource,
      "Payment requirement",
    );
    assert.equal(result.ok, true, `${role} should mutate payment requirements`);
  }
});

test("change order staff permissions reject read-only and field roles", () => {
  for (const role of [StaffRole.VIEWER, StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
    assert.equal(assertExecutionPlanPermission(role, "approve_scope_revision").ok, false);
    assert.equal(assertExecutionPlanPermission(role, "apply_scope_revision").ok, false);
  }

  for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE] as const) {
    assert.equal(assertExecutionPlanPermission(role, "approve_scope_revision").ok, true);
    assert.equal(assertExecutionPlanPermission(role, "apply_scope_revision").ok, true);
  }
});

test("quote and payment mutation actions use explicit mutation context", () => {
  const mutationFiles = [
    "app/(workspace)/quotes/quote-form-actions.ts",
    "app/(workspace)/quotes/quote-payment-schedule-actions.ts",
    "app/(workspace)/quotes/quote-job-activation-actions.ts",
    "app/(workspace)/quotes/quote-signature-staff-actions.ts",
    "lib/quote/approve.ts",
    "lib/quote-signature/request-service.ts",
  ];

  for (const file of mutationFiles) {
    assert.match(readSrc(file), /getCommercialMutationContextOrThrow/, `${file} should use mutation context`);
  }
});

test("commercial mutations remain org scoped in staff paths", () => {
  const scopedFiles = [
    "app/(workspace)/quotes/quote-form-actions.ts",
    "app/(workspace)/quotes/quote-payment-schedule-actions.ts",
    "app/(workspace)/change-orders/change-order-actions.ts",
    "app/(workspace)/jobs/job-payment-actions.ts",
  ];

  for (const file of scopedFiles) {
    assert.match(readSrc(file), /organizationId/, `${file} should retain organization scoping`);
  }
});

test("public token acceptance routes stay separate from staff mutation context", () => {
  const quoteTokenAction = readSrc("app/q/sign/[recipientToken]/signature-actions.ts");
  const changeOrderTokenAction = readSrc("app/co/[token]/change-order-share-actions.ts");

  for (const source of [quoteTokenAction, changeOrderTokenAction]) {
    assert.doesNotMatch(source, /getCommercial(?:Mutation|Request)ContextOrThrow|requireCommercialSession/);
  }

  assert.match(quoteTokenAction, /acceptQuoteViaSignatureToken/);
  assert.match(changeOrderTokenAction, /resolveChangeOrderShareToken/);
  assert.doesNotMatch(changeOrderTokenAction, /auditPublicTokenEvent\([^)]*token/s);
});
