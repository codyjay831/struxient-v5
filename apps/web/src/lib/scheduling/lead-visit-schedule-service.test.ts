import assert from "node:assert/strict";
import test from "node:test";
import { LeadVisitRequestStatus } from "@prisma/client";
import { validateLeadVisitTransition } from "./lead-visit-schedule-service";

test("complete transition requires confirmed status", () => {
  const denied = validateLeadVisitTransition(LeadVisitRequestStatus.PENDING, "complete");
  assert.ok(denied);
  assert.match(denied.error, /confirmed/i);

  const allowed = validateLeadVisitTransition(LeadVisitRequestStatus.CONFIRMED, "complete");
  assert.equal(allowed, null);
});

test("no-show transition requires confirmed status", () => {
  const denied = validateLeadVisitTransition(LeadVisitRequestStatus.CANCELED, "no_show");
  assert.ok(denied);
  assert.match(denied.error, /confirmed/i);

  const allowed = validateLeadVisitTransition(LeadVisitRequestStatus.CONFIRMED, "no_show");
  assert.equal(allowed, null);
});
