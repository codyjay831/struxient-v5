import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@prisma/client";
import { canManageOrganizationSettings } from "@/lib/authz/capabilities";
import { denyUnlessCanManageOrgSettings, denyUnlessCanMutate } from "@/lib/staff-authz";

test("intake settings mutations require Owner or Admin", () => {
  assert.equal(denyUnlessCanManageOrgSettings(StaffRole.OWNER), null);
  assert.equal(denyUnlessCanManageOrgSettings(StaffRole.ADMIN), null);
  assert.equal(denyUnlessCanManageOrgSettings(StaffRole.OFFICE), "You do not have permission to change organization settings.");
  assert.equal(denyUnlessCanManageOrgSettings(StaffRole.FIELD), "You do not have permission to change organization settings.");
  assert.equal(denyUnlessCanManageOrgSettings(StaffRole.VIEWER), "You do not have permission to change organization settings.");
});

test("staff intake submit requires mutate capability — Viewer is read-only", () => {
  assert.equal(denyUnlessCanMutate(StaffRole.VIEWER), "You do not have permission to perform this action.");
  assert.equal(denyUnlessCanMutate(StaffRole.OFFICE), null);
  assert.equal(canManageOrganizationSettings(StaffRole.VIEWER), false);
});
