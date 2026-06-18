import assert from "node:assert/strict";
import test from "node:test";
import { getOpportunityFlow, resolveOpportunityActionHref } from "./opportunity-flow";

const baseLead = {
  id: "lead-1",
  status: "QUALIFIED" as const,
  followUpAt: null,
  customerId: "customer-1",
  contactName: "Cody",
  companyName: null,
  email: "cody@example.com",
  phone: "5555551212",
  jobsiteAddressLine: "123 Main St",
  isAddressVerified: true,
};

test("returns LOST for lost lead status", () => {
  const flow = getOpportunityFlow({
    lead: { ...baseLead, status: "LOST" },
    quotes: [],
    visits: [],
    changeRequests: [],
    now: new Date("2026-06-18T12:00:00.000Z"),
  });
  assert.equal(flow.phase, "LOST");
  assert.equal(flow.conditionCode, "LOST");
});

test("returns PAUSED for on-hold lead status", () => {
  const flow = getOpportunityFlow({
    lead: {
      ...baseLead,
      status: "ON_HOLD",
      followUpAt: new Date("2026-06-20T00:00:00.000Z"),
    },
    quotes: [],
    visits: [],
    changeRequests: [],
    now: new Date("2026-06-18T12:00:00.000Z"),
  });
  assert.equal(flow.phase, "PAUSED");
  assert.equal(flow.conditionCode, "PAUSED");
  assert.equal(flow.primaryAction?.kind, "RESUME_OPPORTUNITY");
});

test("prioritizes active job over other states", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-job",
        title: "Q job",
        status: "APPROVED",
        lineItemCount: 1,
        totalCents: 1000,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-10T00:00:00.000Z"),
        job: { id: "job-1", status: "ACTIVE" },
      },
    ],
    visits: [],
    changeRequests: [],
  });
  assert.equal(flow.conditionCode, "JOB_ACTIVE");
  assert.equal(flow.phase, "WON");
});

test("reports waiting on customer after send", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-sent",
        title: "Q sent",
        status: "SENT",
        lineItemCount: 2,
        totalCents: 5000,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-11T00:00:00.000Z"),
        latestSendAt: new Date("2026-06-11T00:00:00.000Z"),
        job: null,
      },
    ],
    visits: [],
    changeRequests: [],
  });
  assert.equal(flow.phase, "CUSTOMER_REVIEW");
  assert.equal(flow.conditionCode, "WAITING_ON_CUSTOMER");
});

test("open change request offers CREATE_REVISION_DRAFT with change request id", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-sent",
        title: "Q sent",
        status: "SENT",
        lineItemCount: 2,
        totalCents: 5000,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-11T00:00:00.000Z"),
        job: null,
      },
    ],
    visits: [],
    changeRequests: [
      {
        id: "cr-1",
        quoteId: "q-sent",
        message: "Can we change scope?",
        createdAt: new Date("2026-06-12T00:00:00.000Z"),
      },
    ],
  });
  assert.equal(flow.primaryAction?.kind, "CREATE_REVISION_DRAFT");
  assert.equal(flow.primaryAction?.targetChangeRequestId, "cr-1");
});

test("open change request loops back to estimating", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-sent",
        title: "Q sent",
        status: "SENT",
        lineItemCount: 2,
        totalCents: 5000,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-11T00:00:00.000Z"),
        job: null,
      },
    ],
    visits: [],
    changeRequests: [
      {
        id: "cr-1",
        quoteId: "q-sent",
        message: "Can we change scope?",
        createdAt: new Date("2026-06-12T00:00:00.000Z"),
      },
    ],
  });
  assert.equal(flow.phase, "ESTIMATING");
  assert.equal(flow.conditionCode, "CUSTOMER_REQUESTED_CHANGES");
});

test("change request requiring visit yields follow-up condition", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-sent",
        title: "Q sent",
        status: "SENT",
        lineItemCount: 2,
        totalCents: 5000,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-11T00:00:00.000Z"),
        job: null,
      },
    ],
    visits: [],
    changeRequests: [
      {
        id: "cr-1",
        quoteId: "q-sent",
        message: "Need another site visit before revising.",
        createdAt: new Date("2026-06-12T00:00:00.000Z"),
      },
    ],
  });
  assert.equal(flow.conditionCode, "FOLLOW_UP_VISIT_REQUIRED");
});

test("scheduled visit shows discovery state", () => {
  const flow = getOpportunityFlow({
    lead: { ...baseLead, customerId: null },
    quotes: [],
    visits: [
      {
        id: "visit-1",
        status: "CONFIRMED",
        confirmedDate: new Date("2026-06-19T10:00:00.000Z"),
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
      },
    ],
    changeRequests: [],
  });
  assert.equal(flow.phase, "DISCOVERY");
  assert.equal(flow.conditionCode, "SALES_VISIT_SCHEDULED");
});

test("confirmed visit with draft quote stays in discovery and offers build scope", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-draft",
        title: "Draft quote",
        status: "DRAFT",
        lineItemCount: 0,
        totalCents: 0,
        createdAt: new Date("2026-06-17T00:00:00.000Z"),
        updatedAt: new Date("2026-06-17T00:00:00.000Z"),
        job: null,
      },
    ],
    visits: [
      {
        id: "visit-1",
        status: "CONFIRMED",
        confirmedDate: new Date("2026-06-19T10:00:00.000Z"),
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
      },
    ],
    changeRequests: [],
  });
  assert.equal(flow.phase, "DISCOVERY");
  assert.equal(flow.conditionCode, "SALES_VISIT_SCHEDULED");
  assert.equal(flow.primaryAction?.kind, "COMPLETE_SALES_VISIT");
  assert.equal(flow.secondaryActions[0]?.kind, "OPEN_DRAFT_QUOTE");
  assert.equal(flow.secondaryActions[0]?.label, "Build scope");
});

test("pending visit with no quote offers start quote secondary action", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [],
    visits: [
      {
        id: "visit-1",
        status: "PENDING",
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
      },
    ],
    changeRequests: [],
  });
  assert.equal(flow.phase, "DISCOVERY");
  assert.equal(flow.secondaryActions[0]?.kind, "START_QUOTE");
});

test("draft revision after issued quote yields revision condition", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [
      {
        id: "q-sent",
        title: "Sent quote",
        status: "SENT",
        lineItemCount: 2,
        totalCents: 5000,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-05T00:00:00.000Z"),
        job: null,
      },
      {
        id: "q-rev",
        title: "Revision quote",
        status: "DRAFT",
        lineItemCount: 0,
        totalCents: 0,
        createdAt: new Date("2026-06-06T00:00:00.000Z"),
        updatedAt: new Date("2026-06-06T00:00:00.000Z"),
        revisionOfQuoteId: "q-sent",
        job: null,
      },
    ],
    visits: [],
    changeRequests: [],
  });
  assert.equal(flow.conditionCode, "REVISION_DRAFT_IN_PROGRESS");
});

test("SEND_QUOTE href opens commercial send and acceptance", () => {
  const href = resolveOpportunityActionHref(
    { kind: "SEND_QUOTE", label: "Send quote", targetQuoteId: "quote-1" },
    { leadId: "lead-1" },
  );
  assert.equal(href, "/quotes/quote-1#commercial-send-acceptance");
});

test("unlinked lead with existing customer match blocks START_QUOTE", () => {
  const flow = getOpportunityFlow({
    lead: {
      ...baseLead,
      customerId: null,
    },
    quotes: [],
    visits: [],
    changeRequests: [],
    hasExistingCustomerMatch: true,
  });
  assert.equal(flow.conditionCode, "CUSTOMER_MATCH_NEEDS_REVIEW");
  assert.equal(flow.primaryAction?.kind, "REVIEW_CUSTOMER_MATCH");
  assert.equal(flow.primaryAction?.label, "Review match");
});

test("REVIEW_CUSTOMER_MATCH href scrolls to customer link panel", () => {
  const href = resolveOpportunityActionHref(
    { kind: "REVIEW_CUSTOMER_MATCH", label: "Review match", targetLeadId: "lead-1" },
    { leadId: "lead-1" },
  );
  assert.equal(href, "/leads/lead-1#customer-link");
});

test("linked customer skips customer match gate even when match flag is set", () => {
  const flow = getOpportunityFlow({
    lead: baseLead,
    quotes: [],
    visits: [],
    changeRequests: [],
    hasExistingCustomerMatch: true,
  });
  assert.equal(flow.conditionCode, "READY_TO_QUOTE");
  assert.equal(flow.primaryAction?.kind, "START_QUOTE");
});
