import assert from "node:assert/strict";
import test from "node:test";
import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
  StaffRole,
} from "@prisma/client";
import {
  formatLeadVisitStatusLabel,
  getAllowedNextActions,
  getLeadVisitActionPermission,
  validateLeadVisitTransition,
  validateOutcomeNextActionPair,
  validateScheduleDetailsInput,
} from "./lead-visit-schedule-service";
import {
  canCompleteLeadVisit,
  canReadLeadVisit,
  canViewLeadVisitAccessDetails,
} from "./lead-visit-access";
import { parseLeadVisitAccessSnapshot } from "./lead-visit-schemas";

test("complete transition requires confirmed status", () => {
  const denied = validateLeadVisitTransition(LeadVisitRequestStatus.PENDING, "complete");
  assert.ok(denied);
  assert.match(denied.error, /scheduled/i);

  const allowed = validateLeadVisitTransition(LeadVisitRequestStatus.CONFIRMED, "complete");
  assert.equal(allowed, null);
});

test("no-show transition requires confirmed status", () => {
  const denied = validateLeadVisitTransition(LeadVisitRequestStatus.CANCELED, "no_show");
  assert.ok(denied);
  assert.match(denied.error, /scheduled/i);

  const allowed = validateLeadVisitTransition(LeadVisitRequestStatus.CONFIRMED, "no_show");
  assert.equal(allowed, null);
});

test("CONFIRMED displays as Scheduled in MVP 1", () => {
  assert.equal(formatLeadVisitStatusLabel(LeadVisitRequestStatus.CONFIRMED), "Scheduled");
});

test("schedule details require end after start", () => {
  const start = new Date("2026-06-20T10:00:00.000Z");
  const error = validateScheduleDetailsInput({
    scheduledStartAt: start,
    scheduledEndAt: new Date("2026-06-20T09:00:00.000Z"),
  });
  assert.ok(error);
  assert.match(error.error, /after scheduled start/i);
});

test("access snapshot rejects unknown keys", () => {
  const parsed = parseLeadVisitAccessSnapshot({
    gateCode: "1234",
    unexpected: true,
  });
  assert.ok("error" in parsed);
});

test("access snapshot accepts bounded shape", () => {
  const parsed = parseLeadVisitAccessSnapshot({
    someoneMustBeHome: true,
    gateCode: "1234",
    accessNotes: "Side gate",
  });
  assert.ok(!("error" in parsed));
  assert.equal(parsed.someoneMustBeHome, true);
});

test("outcome and next action compatibility matrix is enforced", () => {
  assert.equal(
    validateOutcomeNextActionPair(
      LeadVisitOutcome.QUOTE_READY,
      LeadVisitNextAction.START_QUOTE,
    ),
    null,
  );
  assert.equal(
    validateOutcomeNextActionPair(
      LeadVisitOutcome.QUOTE_READY,
      LeadVisitNextAction.CLOSE_OR_DISQUALIFY,
    )?.error.includes("not allowed"),
    true,
  );
  assert.deepEqual(getAllowedNextActions(LeadVisitOutcome.MISSING_INFORMATION), [
    LeadVisitNextAction.COLLECT_MISSING_INFO,
  ]);
});

test("assigned FIELD estimator can complete assigned visit", () => {
  assert.equal(
    getLeadVisitActionPermission(StaffRole.FIELD, "complete", "user-1", "user-1").ok,
    true,
  );
  assert.equal(
    getLeadVisitActionPermission(StaffRole.FIELD, "complete", "user-2", "user-1").ok,
    false,
  );
});

test("viewer cannot read access details", () => {
  assert.equal(
    canViewLeadVisitAccessDetails({
      role: StaffRole.VIEWER,
      userId: "viewer-1",
      assignedUserId: "viewer-1",
    }),
    false,
  );
  assert.equal(
    canReadLeadVisit({
      role: StaffRole.VIEWER,
      userId: "viewer-1",
      assignedUserId: null,
    }),
    true,
  );
});

test("subcontractor cannot read lead visits", () => {
  assert.equal(
    canReadLeadVisit({
      role: StaffRole.SUBCONTRACTOR,
      userId: "sub-1",
      assignedUserId: "sub-1",
    }),
    false,
  );
});

test("assigned FIELD can complete but not cancel", () => {
  const ctx = {
    role: StaffRole.FIELD,
    userId: "field-1",
    assignedUserId: "field-1",
  };
  assert.equal(canCompleteLeadVisit(ctx), true);
  assert.equal(
    getLeadVisitActionPermission(StaffRole.FIELD, "cancel", "field-1", "field-1").ok,
    false,
  );
});

test("complete transition rejects legacy completed visits", () => {
  const denied = validateLeadVisitTransition(LeadVisitRequestStatus.COMPLETED, "complete");
  assert.ok(denied);
  assert.match(denied.error, /scheduled/i);
});

test("outcome update path uses matrix validation for completed visits", () => {
  assert.equal(
    validateOutcomeNextActionPair(
      LeadVisitOutcome.QUOTE_READY,
      LeadVisitNextAction.START_QUOTE,
    ),
    null,
  );
  assert.ok(
    validateOutcomeNextActionPair(
      LeadVisitOutcome.QUOTE_READY,
      LeadVisitNextAction.CLOSE_OR_DISQUALIFY,
    ),
  );
});
