import assert from "node:assert/strict";
import test from "node:test";
import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
} from "@prisma/client";
import {
  assignedVisitFieldStatusFromOutcome,
  isAssignedVisitFieldAction,
  presentOpportunityFlowForAssignedVisitSurface,
} from "./assigned-lead-visit-surface-presentation";
import type { OpportunityFlowView } from "@/lib/opportunity-flow";

const baseFlow = (): OpportunityFlowView => ({
  phase: "ESTIMATING",
  conditionCode: "READY_TO_QUOTE",
  conditionLabel: "Ready to quote",
  conditionStartedAt: "2026-06-18T12:00:00.000Z",
  ageLabel: "1d",
  summary: "Site visit completed and quote can start.",
  requirements: ["Build quote"],
  satisfiedItems: [],
  primaryAction: {
    kind: "START_QUOTE",
    label: "Build quote",
    targetLeadId: "lead-1",
  },
  secondaryActions: [
    { kind: "OPEN_DRAFT_QUOTE", label: "Build scope", targetQuoteId: "quote-1" },
    { kind: "COMPLETE_SALES_VISIT", label: "Record visit outcome", targetVisitRequestId: "visit-1" },
  ],
  keyFacts: [],
  recentEvents: [],
});

test("isAssignedVisitFieldAction allows only visit workflow actions", () => {
  assert.equal(isAssignedVisitFieldAction("COMPLETE_SALES_VISIT"), true);
  assert.equal(isAssignedVisitFieldAction("SCHEDULE_SALES_VISIT"), true);
  assert.equal(isAssignedVisitFieldAction("START_QUOTE"), false);
  assert.equal(isAssignedVisitFieldAction("OPEN_QUOTE"), false);
});

test("assignedVisitFieldStatusFromOutcome maps QUOTE_READY to office review copy", () => {
  assert.equal(
    assignedVisitFieldStatusFromOutcome({
      status: LeadVisitRequestStatus.COMPLETED,
      outcome: LeadVisitOutcome.QUOTE_READY,
      nextAction: LeadVisitNextAction.START_QUOTE,
    }),
    "Quote ready for office review",
  );
});

test("presentOpportunityFlowForAssignedVisitSurface strips commercial actions", () => {
  const presented = presentOpportunityFlowForAssignedVisitSurface(baseFlow(), [
    {
      id: "visit-1",
      status: LeadVisitRequestStatus.COMPLETED,
      outcome: LeadVisitOutcome.QUOTE_READY,
      nextAction: LeadVisitNextAction.START_QUOTE,
    },
  ]);

  assert.equal(presented.primaryAction, null);
  assert.equal(presented.secondaryActions.length, 0);
  assert.equal(presented.assignedFieldStatusLine, "Quote ready for office review");
  assert.equal(presented.summary, "Quote ready for office review");
});

test("presentOpportunityFlowForAssignedVisitSurface keeps complete visit action for scheduled visits", () => {
  const flow: OpportunityFlowView = {
    ...baseFlow(),
    phase: "DISCOVERY",
    conditionCode: "SALES_VISIT_SCHEDULED",
    primaryAction: {
      kind: "COMPLETE_SALES_VISIT",
      label: "Complete site visit",
      targetVisitRequestId: "visit-1",
      targetLeadId: "lead-1",
    },
    secondaryActions: [{ kind: "START_QUOTE", label: "Build quote", targetLeadId: "lead-1" }],
  };

  const presented = presentOpportunityFlowForAssignedVisitSurface(flow, [
    {
      id: "visit-1",
      status: LeadVisitRequestStatus.CONFIRMED,
    },
  ]);

  assert.equal(presented.primaryAction?.kind, "COMPLETE_SALES_VISIT");
  assert.equal(presented.secondaryActions.length, 0);
  assert.equal(presented.assignedFieldStatusLine, null);
});

test("presentOpportunityFlowForAssignedVisitSurface maps missing info outcome", () => {
  const presented = presentOpportunityFlowForAssignedVisitSurface(
    {
      ...baseFlow(),
      primaryAction: {
        kind: "EDIT_CONTACT_INFO",
        label: "Add details",
        targetLeadId: "lead-1",
      },
      secondaryActions: [],
    },
    [
      {
        id: "visit-1",
        status: LeadVisitRequestStatus.COMPLETED,
        outcome: LeadVisitOutcome.MISSING_INFORMATION,
        nextAction: LeadVisitNextAction.COLLECT_MISSING_INFO,
      },
    ],
  );

  assert.equal(presented.primaryAction, null);
  assert.equal(presented.assignedFieldStatusLine, "Missing info recorded");
});
