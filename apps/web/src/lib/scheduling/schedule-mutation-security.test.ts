import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@prisma/client";
import {
  getLeadVisitActionPermission,
  validateLeadVisitTransition,
} from "./lead-visit-schedule-service";
import { getScheduleBlockMutationPermission } from "./schedule-block-service";
import { LeadVisitRequestStatus } from "@prisma/client";

test("viewer cannot confirm lead visits", () => {
  const gate = getLeadVisitActionPermission(StaffRole.VIEWER, "confirm");
  assert.equal(gate.ok, false);
});

test("office can cancel lead visits", () => {
  const gate = getLeadVisitActionPermission(StaffRole.OFFICE, "cancel");
  assert.equal(gate.ok, true);
});

test("field cannot create schedule blocks", () => {
  const gate = getScheduleBlockMutationPermission(StaffRole.FIELD, false);
  assert.equal(gate.ok, false);
});

test("office can update schedule blocks", () => {
  const gate = getScheduleBlockMutationPermission(StaffRole.OFFICE, true);
  assert.equal(gate.ok, true);
});

test("validateLeadVisitTransition rejects confirm on confirmed visit", () => {
  const result = validateLeadVisitTransition(
    LeadVisitRequestStatus.CONFIRMED,
    "confirm",
  );
  assert.ok(result);
  assert.match(result.error, /pending/i);
});

test("validateLeadVisitTransition rejects reschedule on pending visit", () => {
  const result = validateLeadVisitTransition(
    LeadVisitRequestStatus.PENDING,
    "reschedule",
  );
  assert.ok(result);
  assert.match(result.error, /confirmed/i);
});
