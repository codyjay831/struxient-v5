import assert from "node:assert/strict";
import test from "node:test";
import { denyUnlessCanManageCommercial } from "../staff-authz";
import { StaffRole } from "@prisma/client";

test("field and subcontractor roles cannot perform commercial mutations", () => {
  assert.equal(denyUnlessCanManageCommercial(StaffRole.FIELD), "You do not have permission to perform this action.");
  assert.equal(
    denyUnlessCanManageCommercial(StaffRole.SUBCONTRACTOR),
    "You do not have permission to perform this action.",
  );
  assert.equal(denyUnlessCanManageCommercial(StaffRole.OFFICE), null);
  assert.equal(denyUnlessCanManageCommercial(StaffRole.ADMIN), null);
});
