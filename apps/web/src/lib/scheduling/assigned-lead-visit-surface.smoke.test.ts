import assert from "node:assert/strict";
import test from "node:test";
import {
  LeadVisitNextAction,
  LeadVisitOutcome,
  LeadVisitRequestStatus,
  StaffRole,
} from "@prisma/client";
import { presentOpportunityFlowForAssignedVisitSurface } from "./assigned-lead-visit-surface-presentation";
import { resolveLeadSurfaceAccess } from "./lead-visit-lead-access";
import { getOpportunityFlow } from "@/lib/opportunity-flow";

test("smoke: assigned FIELD surface hides Build quote after QUOTE_READY visit", () => {
  const commercialFlow = getOpportunityFlow({
    lead: {
      id: "lead-smoke-1",
      status: "QUALIFIED",
      followUpAt: null,
      customerId: "cust-1",
      contactName: "Pat Example",
      companyName: null,
      email: "pat@example.com",
      phone: "555-0100",
      jobsiteAddressLine: "123 Main St",
      isAddressVerified: true,
    },
    quotes: [],
    visits: [
      {
        id: "visit-smoke-1",
        status: LeadVisitRequestStatus.COMPLETED,
        completedAt: new Date("2026-06-18T12:00:00.000Z"),
        outcome: LeadVisitOutcome.QUOTE_READY,
        nextAction: LeadVisitNextAction.START_QUOTE,
        createdAt: new Date("2026-06-10T00:00:00.000Z"),
      },
    ],
    changeRequests: [],
    now: new Date("2026-06-19T12:00:00.000Z"),
  });

  const flow = {
    ...commercialFlow,
    primaryAction: {
      kind: "START_QUOTE" as const,
      label: "Build quote",
      targetLeadId: "lead-smoke-1",
    },
    secondaryActions: [
      { kind: "OPEN_DRAFT_QUOTE" as const, label: "Build scope", targetQuoteId: "quote-1" },
    ],
  };

  const presented = presentOpportunityFlowForAssignedVisitSurface(flow, [
    {
      id: "visit-smoke-1",
      status: LeadVisitRequestStatus.COMPLETED,
      outcome: LeadVisitOutcome.QUOTE_READY,
      nextAction: LeadVisitNextAction.START_QUOTE,
    },
  ]);

  assert.equal(presented.primaryAction, null);
  assert.equal(presented.secondaryActions.length, 0);
  assert.equal(presented.assignedFieldStatusLine, "Quote ready for office review");
});

test("smoke: scheduled visit keeps FIELD-complete action only", () => {
  const flow = getOpportunityFlow({
    lead: {
      id: "lead-smoke-2",
      status: "QUALIFIED",
      followUpAt: null,
      customerId: null,
      contactName: "Pat Example",
      companyName: null,
      email: null,
      phone: null,
      jobsiteAddressLine: "123 Main St",
      isAddressVerified: true,
    },
    quotes: [],
    visits: [
      {
        id: "visit-smoke-2",
        status: LeadVisitRequestStatus.CONFIRMED,
        scheduledStartAt: new Date("2026-06-19T14:00:00.000Z"),
        createdAt: new Date("2026-06-10T00:00:00.000Z"),
        hasAccessDetails: true,
      },
    ],
    changeRequests: [],
    now: new Date("2026-06-19T12:00:00.000Z"),
  });

  const presented = presentOpportunityFlowForAssignedVisitSurface(flow, [
    { id: "visit-smoke-2", status: LeadVisitRequestStatus.CONFIRMED },
  ]);

  assert.equal(presented.primaryAction?.kind, "COMPLETE_SALES_VISIT");
  assert.equal(
    presented.secondaryActions.some((action) => action.kind === "START_QUOTE"),
    false,
  );
  assert.equal(presented.assignedFieldStatusLine, null);
});

test("smoke: unassigned FIELD is denied lead surface access", async () => {
  const access = await resolveLeadSurfaceAccess(
    {
      userId: "field-unassigned",
      organizationId: "org-1",
      role: StaffRole.FIELD,
    },
    "lead-unrelated",
  );
  assert.equal(access.mode, "denied");
});
