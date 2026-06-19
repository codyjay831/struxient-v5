import assert from "node:assert/strict";
import test from "node:test";
import { LeadVisitRequestStatus, LeadVisitNextAction, LeadVisitOutcome } from "@prisma/client";
import {
  classifyAssignedLeadVisitWorkstationAttention,
  isVisitScheduledTodayOrTomorrow,
  resolveLeadVisitWorkstationHref,
  visitHasMissingAccess,
  visitHasMissingOutcome,
} from "./lead-visit-lead-access";

test("resolveLeadVisitWorkstationHref keeps lead route for assigned visit context", () => {
  assert.equal(resolveLeadVisitWorkstationHref("lead-1"), "/leads/lead-1");
});

test("visitHasMissingOutcome is true only for completed visits missing outcome data", () => {
  assert.equal(
    visitHasMissingOutcome({
      status: LeadVisitRequestStatus.COMPLETED,
      outcome: null,
      nextAction: null,
    }),
    true,
  );
  assert.equal(
    visitHasMissingOutcome({
      status: LeadVisitRequestStatus.COMPLETED,
      outcome: LeadVisitOutcome.QUOTE_READY,
      nextAction: LeadVisitNextAction.START_QUOTE,
    }),
    false,
  );
  assert.equal(
    visitHasMissingOutcome({
      status: LeadVisitRequestStatus.CONFIRMED,
      outcome: null,
      nextAction: null,
    }),
    false,
  );
});

test("visitHasMissingAccess detects empty access snapshot", () => {
  assert.equal(visitHasMissingAccess(null), true);
  assert.equal(visitHasMissingAccess({ gateCode: "1234" }), false);
});

test("classifyAssignedLeadVisitWorkstationAttention marks far-future scheduled visits low urgency", () => {
  const now = new Date("2026-06-19T12:00:00.000Z");
  const farFuture = new Date("2026-08-01T14:00:00.000Z");
  const attention = classifyAssignedLeadVisitWorkstationAttention({
    status: LeadVisitRequestStatus.CONFIRMED,
    scheduledStart: farFuture,
    hasMissingAccess: false,
    hasMissingOutcome: false,
    now,
  });
  assert.equal(attention.priority, "low");
  assert.equal(attention.lens, "upcoming");
  assert.equal(attention.include, true);
});

test("classifyAssignedLeadVisitWorkstationAttention marks today visits high urgency", () => {
  const now = new Date("2026-06-19T12:00:00.000Z");
  const today = new Date("2026-06-19T15:00:00.000Z");
  const attention = classifyAssignedLeadVisitWorkstationAttention({
    status: LeadVisitRequestStatus.CONFIRMED,
    scheduledStart: today,
    hasMissingAccess: false,
    hasMissingOutcome: false,
    now,
  });
  assert.equal(attention.priority, "high");
  assert.equal(attention.lens, "attention");
});

test("classifyAssignedLeadVisitWorkstationAttention marks missing outcome critical", () => {
  const now = new Date("2026-06-19T12:00:00.000Z");
  const attention = classifyAssignedLeadVisitWorkstationAttention({
    status: LeadVisitRequestStatus.COMPLETED,
    scheduledStart: new Date("2026-06-18T15:00:00.000Z"),
    hasMissingAccess: false,
    hasMissingOutcome: true,
    now,
  });
  assert.equal(attention.priority, "critical");
  assert.equal(attention.include, true);
});

test("classifyAssignedLeadVisitWorkstationAttention hides completed visits with outcome", () => {
  const now = new Date("2026-06-19T12:00:00.000Z");
  const attention = classifyAssignedLeadVisitWorkstationAttention({
    status: LeadVisitRequestStatus.COMPLETED,
    scheduledStart: new Date("2026-06-18T15:00:00.000Z"),
    hasMissingAccess: false,
    hasMissingOutcome: false,
    now,
  });
  assert.equal(attention.include, false);
});

test("isVisitScheduledTodayOrTomorrow covers today and tomorrow only", () => {
  const now = new Date("2026-06-19T12:00:00.000Z");
  assert.equal(isVisitScheduledTodayOrTomorrow(new Date("2026-06-19T18:00:00.000Z"), now), true);
  assert.equal(isVisitScheduledTodayOrTomorrow(new Date("2026-06-20T09:00:00.000Z"), now), true);
  assert.equal(isVisitScheduledTodayOrTomorrow(new Date("2026-06-21T09:00:00.000Z"), now), false);
});
