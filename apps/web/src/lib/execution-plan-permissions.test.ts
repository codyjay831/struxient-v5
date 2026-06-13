import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@prisma/client";
import {
  assertExecutionPlanPermission,
  canUseExecutionPlanPermission,
} from "./execution-plan-permissions";

test("owners can apply scope revisions", () => {
  assert.equal(canUseExecutionPlanPermission(StaffRole.OWNER, "apply_scope_revision"), true);
});

test("viewers cannot accept plans", () => {
  const result = assertExecutionPlanPermission(StaffRole.VIEWER, "accept_plan");
  assert.equal(result.ok, false);
});

test("field users can cancel tasks but cannot adjust payments", () => {
  assert.equal(canUseExecutionPlanPermission(StaffRole.FIELD, "cancel_task"), true);
  assert.equal(canUseExecutionPlanPermission(StaffRole.FIELD, "adjust_payments"), false);
});

