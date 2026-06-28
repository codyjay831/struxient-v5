import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@prisma/client";
import {
  denyUnlessCanManageCommercial,
  denyUnlessCanReadCommercial,
} from "./staff-authz";
import {
  assertExecutionPlanPermission,
  canUseExecutionPlanPermission,
} from "./execution-plan-permissions";

test("owners can apply scope revisions", () => {
  assert.equal(canUseExecutionPlanPermission(StaffRole.OWNER, "apply_scope_revision"), true);
});

test("owners admins and office can edit execution plans", () => {
  for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE] as const) {
    assert.equal(canUseExecutionPlanPermission(role, "edit_execution_plan"), true);
    const result = assertExecutionPlanPermission(role, "edit_execution_plan");
    assert.equal(result.ok, true);
  }
});

test("viewers cannot accept plans", () => {
  const result = assertExecutionPlanPermission(StaffRole.VIEWER, "accept_plan");
  assert.equal(result.ok, false);
});

test("viewers cannot edit execution plans", () => {
  const result = assertExecutionPlanPermission(StaffRole.VIEWER, "edit_execution_plan");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /edit quote execution plans/i);
  }
});

test("field users cannot edit execution plans", () => {
  const result = assertExecutionPlanPermission(StaffRole.FIELD, "edit_execution_plan");
  assert.equal(result.ok, false);
});

test("subcontractors cannot edit execution plans", () => {
  const result = assertExecutionPlanPermission(StaffRole.SUBCONTRACTOR, "edit_execution_plan");
  assert.equal(result.ok, false);
});

test("field users can cancel tasks but cannot adjust payments", () => {
  assert.equal(canUseExecutionPlanPermission(StaffRole.FIELD, "cancel_task"), true);
  assert.equal(canUseExecutionPlanPermission(StaffRole.FIELD, "adjust_payments"), false);
});

test("viewers retain commercial read access for execution review pages", () => {
  assert.equal(denyUnlessCanReadCommercial(StaffRole.VIEWER), null);
});

test("field users are denied commercial mutation access", () => {
  assert.equal(denyUnlessCanManageCommercial(StaffRole.FIELD), "You do not have permission to perform this action.");
});

