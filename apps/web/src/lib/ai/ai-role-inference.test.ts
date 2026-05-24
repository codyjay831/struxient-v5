import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole, TaskTemplateCategory } from "@prisma/client";
import { inferAssigneeRoleForTask } from "./ai-role-inference";

test("conservative role inference for permit/payment/scheduling/customer communication", () => {
  assert.equal(
    inferAssigneeRoleForTask({ title: "Submit permit package", category: TaskTemplateCategory.PERMIT, assigneeRole: null }),
    StaffRole.OFFICE,
  );
  assert.equal(
    inferAssigneeRoleForTask({ title: "Collect final payment", category: TaskTemplateCategory.PAYMENT, assigneeRole: null }),
    StaffRole.OFFICE,
  );
  assert.equal(
    inferAssigneeRoleForTask({ title: "Schedule rough inspection", category: TaskTemplateCategory.SCHEDULING, assigneeRole: null }),
    StaffRole.OFFICE,
  );
});

test("inspection schedule and attend infer OFFICE/FIELD respectively", () => {
  assert.equal(
    inferAssigneeRoleForTask({ title: "Request final inspection", category: TaskTemplateCategory.INSPECTION, assigneeRole: null }),
    StaffRole.OFFICE,
  );
  assert.equal(
    inferAssigneeRoleForTask({ title: "Attend final inspection onsite", category: TaskTemplateCategory.INSPECTION, assigneeRole: null }),
    StaffRole.FIELD,
  );
});

test("uncertain general tasks remain null", () => {
  assert.equal(
    inferAssigneeRoleForTask({ title: "Perform work per scope", category: TaskTemplateCategory.GENERAL, assigneeRole: null }),
    null,
  );
});
