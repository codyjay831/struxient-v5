import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@prisma/client";
import { assertSchedulePermission, canUseSchedulePermission } from "./schedule-permissions";

test("owner has terminal correction permission", () => {
  assert.equal(
    canUseSchedulePermission(StaffRole.OWNER, "correct_terminal_event"),
    true,
  );
});

test("viewer cannot complete schedule events", () => {
  const gate = assertSchedulePermission(StaffRole.VIEWER, "complete");
  assert.equal(gate.ok, false);
});

test("field can reschedule confirmed events", () => {
  assert.equal(
    canUseSchedulePermission(StaffRole.FIELD, "reschedule_confirmed"),
    true,
  );
});
