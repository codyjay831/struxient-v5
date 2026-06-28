import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderStatus,
  QuoteStatus,
} from "@prisma/client";
import {
  buildQuoteRecordActionState,
  toEmbeddedWorkflow,
} from "@/lib/record-workflow-surface";
import { getQuoteReadiness } from "@/lib/quote-readiness";
import type { ChangeOrderSendBlocker } from "@/lib/change-order/change-order-send-readiness";
import { deriveChangeOrderWorkstationAttention } from "@/lib/change-order/change-order-workstation-attention";
import { rank } from "@/lib/workstation/rank";
import { mapAttentionItemToWorkstationWorkItem } from "./workstation-mapper";
import { pickWorkstationParityFields } from "./pick-workstation-parity-fields";
import { buildQuoteOperationalAttentionItems } from "./adapters/quote-attention";
import { buildChangeOrderOperationalAttentionItems } from "./adapters/change-order-attention";

const now = new Date("2026-06-26T12:00:00.000Z");
const updatedAt = new Date("2026-06-20T12:00:00.000Z");
const role = "OWNER" as const;

function quoteReadiness(status: QuoteStatus, ready: boolean | null) {
  return getQuoteReadiness({
    quote: {
      status,
      lineItemCount: 2,
      subtotalCents: 100_000,
      totalCents: 100_000,
    },
    job: null,
    activationReadiness:
      ready == null
        ? null
        : {
            ready,
            totalTasksToActivate: ready ? 4 : 0,
            needsAttentionLineCount: ready ? 0 : 1,
            anomalyLineCount: 0,
          },
  });
}

function mapQuoteViaAdapter(input: Parameters<typeof buildQuoteOperationalAttentionItems>[0]) {
  const [attention] = buildQuoteOperationalAttentionItems(input);
  const mapped = mapAttentionItemToWorkstationWorkItem(attention);
  assert.ok(mapped);
  return mapped;
}

function mapCoViaAdapter(input: Parameters<typeof buildChangeOrderOperationalAttentionItems>[0]) {
  const [attention] = buildChangeOrderOperationalAttentionItems(input);
  const mapped = mapAttentionItemToWorkstationWorkItem(attention);
  assert.ok(mapped);
  return mapped;
}

function coBlocker(
  code: ChangeOrderSendBlocker["code"],
  explanation: string,
  actionLabel: string | null,
): ChangeOrderSendBlocker {
  return {
    code,
    severity: "blocker",
    title: code,
    explanation,
    actionLabel,
    actionTarget: code === "PAYMENT_IMPACT" ? "commercial" : "execution",
  };
}

test("quote integration parity: approved ready for activation", () => {
  const readiness = quoteReadiness(QuoteStatus.APPROVED, true);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-1",
      title: "Kitchen remodel",
      subtitle: "Quote: Kitchen remodel",
      customerId: "customer-1",
      leadId: "lead-1",
      readiness,
    }),
  );
  const priority = "critical" as const;
  const group = "investigate" as const;
  const { lane, withinLaneRank, reason: rankReason } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-1",
    title: "Kitchen remodel",
    subtitle: "Quote: Kitchen remodel",
    customerId: "customer-1",
    leadId: "lead-1",
    parentRecordId: "customer-1",
    parentLabel: "Cody Homeowner",
    href: "/leads/lead-1?tab=quote",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.APPROVED,
    reason: rankReason || workflow.reason,
    workflow,
    workstationCopy: {
      status: QuoteStatus.APPROVED,
      reason: "Approved quote is waiting for job setup.",
      nextStep: "Activate job",
    },
  });

  assert.deepEqual(pickWorkstationParityFields(mapped), {
    id: "quote-quote-1",
    kind: "quote",
    title: "Kitchen remodel",
    subtitle: "Quote: Kitchen remodel",
    contextLine: undefined,
    scopeLabel: undefined,
    addressLine: undefined,
    ageLabel: undefined,
    valueLabel: undefined,
    typeLabel: "Quote",
    status: QuoteStatus.APPROVED,
    priority: "critical",
    group: "investigate",
    lens: "attention",
    lane,
    withinLaneRank,
    filterCategory: "quotes",
    reason: "Approved quote is waiting for job setup.",
    nextStep: "Activate job",
    recordId: "quote-1",
    parentRecordId: "customer-1",
    parentLabel: "Cody Homeowner",
    leadAnchorId: "lead-1",
    href: "/leads/lead-1?tab=quote",
    updatedAt: updatedAt.toISOString(),
    workflowNextActionType: "ACTIVATE_JOB",
    workflowNextActionLabel: "Activate job",
    actionKind: undefined,
    actionLabel: undefined,
    actionIssueId: undefined,
    actionTaskId: undefined,
  });
});

test("quote integration parity: approved blocked by missing execution plan", () => {
  const readiness = quoteReadiness(QuoteStatus.APPROVED, false);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-2",
      title: "Bathroom remodel",
      customerId: "customer-1",
      leadId: null,
      readiness,
    }),
  );
  const priority = "critical" as const;
  const group = "investigate" as const;
  const { lane, withinLaneRank } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-2",
    title: "Bathroom remodel",
    customerId: "customer-1",
    leadId: null,
    parentRecordId: "customer-1",
    href: "/quotes/quote-2",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.APPROVED,
    workflow,
    workstationCopy: {
      status: QuoteStatus.APPROVED,
      reason: "Approved quote is waiting for job setup.",
      nextStep: "Build execution plan",
    },
  });

  assert.equal(mapped.id, "quote-quote-2");
  assert.equal(mapped.reason, "Approved quote is waiting for job setup.");
  assert.equal(mapped.nextStep, "Build execution plan");
  assert.equal(mapped.workflow?.nextAction?.type, "OPEN_EXECUTION_REVIEW");
});

test("quote integration parity: sent waiting state", () => {
  const readiness = quoteReadiness(QuoteStatus.SENT, null);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-3",
      title: "Roof replacement",
      customerId: "customer-1",
      leadId: "lead-1",
      readiness,
    }),
  );
  const priority = "low" as const;
  const group = "ready" as const;
  const { lane, withinLaneRank, reason: rankReason } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-3",
    title: "Roof replacement",
    customerId: "customer-1",
    leadId: "lead-1",
    parentRecordId: "customer-1",
    href: "/leads/lead-1?tab=quote",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.SENT,
    reason: rankReason || workflow.reason,
    workflow,
    workstationCopy: {
      status: QuoteStatus.SENT,
      reason: rankReason || workflow.reason,
      nextStep: "Mark approved",
    },
  });

  assert.equal(mapped.id, "quote-quote-3");
  assert.equal(mapped.status, QuoteStatus.SENT);
  assert.equal(mapped.nextStep, "Mark approved");
  assert.equal(mapped.priority, "low");
});

test("quote integration parity: customer requested changes", () => {
  const readiness = quoteReadiness(QuoteStatus.SENT, null);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-4",
      title: "Deck build",
      customerId: "customer-1",
      leadId: "lead-1",
      readiness,
    }),
  );
  const priority = "critical" as const;
  const group = "investigate" as const;
  const { lane, withinLaneRank } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-4",
    title: "Deck build",
    customerId: "customer-1",
    leadId: "lead-1",
    parentRecordId: "customer-1",
    href: "/leads/lead-1?tab=quote",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.SENT,
    openChangeRequest: { requiresVisit: true },
    workflow,
    workstationCopy: {
      status: "Customer requested changes",
      reason: "Customer requested changes and follow-up visit may be required.",
      nextStep: "Create revision draft.",
    },
  });

  assert.equal(mapped.status, "Customer requested changes");
  assert.equal(mapped.reason, "Customer requested changes and follow-up visit may be required.");
  assert.equal(mapped.nextStep, "Create revision draft.");
});

test("quote integration parity: revision draft in progress and ready to send", () => {
  const readiness = quoteReadiness(QuoteStatus.SENT, null);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-5",
      title: "Fence install",
      customerId: "customer-1",
      leadId: null,
      readiness,
    }),
  );
  const priority = "critical" as const;
  const group = "investigate" as const;
  const { lane, withinLaneRank } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const draftInProgress = mapQuoteViaAdapter({
    quoteId: "quote-5",
    title: "Fence install",
    customerId: "customer-1",
    leadId: null,
    parentRecordId: "customer-1",
    href: "/quotes/quote-5",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.SENT,
    openChangeRequest: { requiresVisit: false, draftRevisionLineItemCount: 0 },
    workflow,
    workstationCopy: {
      status: "Revision draft in progress",
      reason: "Customer requested changes on this quote.",
      nextStep: "Continue revision draft.",
    },
  });
  assert.equal(draftInProgress.status, "Revision draft in progress");

  const readyToSend = mapQuoteViaAdapter({
    quoteId: "quote-5",
    title: "Fence install",
    customerId: "customer-1",
    leadId: null,
    parentRecordId: "customer-1",
    href: "/quotes/quote-5",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.SENT,
    openChangeRequest: { requiresVisit: false, draftRevisionLineItemCount: 2 },
    workflow,
    workstationCopy: {
      status: "Revision ready to send",
      reason: "Customer requested changes on this quote.",
      nextStep: "Continue revision draft.",
    },
  });
  assert.equal(readyToSend.status, "Revision ready to send");
});

test("quote integration parity: customer accepted portal copy", () => {
  const readiness = quoteReadiness(QuoteStatus.SENT, null);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-6",
      title: "Solar install",
      customerId: "customer-1",
      leadId: null,
      readiness,
    }),
  );
  const priority = "high" as const;
  const group = "ready" as const;
  const { lane, withinLaneRank, reason: rankReason } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-6",
    title: "Solar install",
    customerId: "customer-1",
    leadId: null,
    parentRecordId: "customer-1",
    href: "/quotes/quote-6",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.SENT,
    isCustomerAccepted: true,
    reason: rankReason || workflow.reason,
    workflow,
    workstationCopy: {
      status: QuoteStatus.SENT,
      reason: "Accepted by customer via portal.",
      nextStep: "Mark approved",
    },
  });

  assert.equal(mapped.reason, "Accepted by customer via portal.");
});

test("quote integration parity: site visit requested overlay", () => {
  const readiness = quoteReadiness(QuoteStatus.SENT, null);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-7",
      title: "Window replacement",
      customerId: "customer-1",
      leadId: "lead-1",
      readiness,
    }),
  );
  const priority = "critical" as const;
  const group = "investigate" as const;
  const { lane, withinLaneRank } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-7",
    title: "Window replacement",
    customerId: "customer-1",
    leadId: "lead-1",
    parentRecordId: "customer-1",
    href: "/leads/lead-1?tab=quote",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.SENT,
    workflow,
    workstationCopy: {
      status: "Site visit requested",
      reason: "Site visit requested for 6/28/2026.",
      nextStep: "Schedule site visit.",
    },
  });

  assert.equal(mapped.id, "quote-quote-7");
  assert.equal(mapped.status, "Site visit requested");
  assert.equal(mapped.reason, "Site visit requested for 6/28/2026.");
  assert.equal(mapped.nextStep, "Schedule site visit.");
  assert.equal(mapped.priority, "critical");
  assert.equal(mapped.group, "investigate");
});

test("quote integration parity: site visit scheduled overlay", () => {
  const readiness = quoteReadiness(QuoteStatus.APPROVED, true);
  const workflow = toEmbeddedWorkflow(
    buildQuoteRecordActionState({
      quoteId: "quote-8",
      title: "HVAC upgrade",
      customerId: "customer-1",
      leadId: "lead-1",
      readiness,
    }),
  );
  const priority = "high" as const;
  const group = "scheduled" as const;
  const { lane, withinLaneRank } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapQuoteViaAdapter({
    quoteId: "quote-8",
    title: "HVAC upgrade",
    customerId: "customer-1",
    leadId: "lead-1",
    parentRecordId: "customer-1",
    href: "/leads/lead-1?tab=quote",
    updatedAt,
    readiness,
    rank: { priority, group, lens: "attention", lane, withinLaneRank },
    status: QuoteStatus.APPROVED,
    workflow,
    workstationCopy: {
      status: "Site visit scheduled",
      reason: "Site visit scheduled for 7/1/2026.",
      nextStep: "Complete site visit.",
    },
  });

  assert.equal(mapped.status, "Site visit scheduled");
  assert.equal(mapped.reason, "Site visit scheduled for 7/1/2026.");
  assert.equal(mapped.nextStep, "Complete site visit.");
  assert.equal(mapped.group, "scheduled");
  assert.equal(mapped.priority, "high");
});

test("change-order integration parity: draft ready to send", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.DRAFT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  const priority = attention.priority;
  const group = "waiting" as const;
  const { lane, withinLaneRank, reason: rankReason } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapCoViaAdapter({
    changeOrderId: "co-1",
    number: 7,
    title: "Add recessed lights",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    customerLabel: "Cody Homeowner",
    status: ChangeOrderStatus.DRAFT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason,
    rank: { priority, group, lens: attention.lens, lane, withinLaneRank },
  });

  assert.deepEqual(pickWorkstationParityFields(mapped), {
    id: "change-order-co-1",
    kind: "change-order",
    title: "CO-007 · Add recessed lights",
    subtitle: "Cody Homeowner",
    contextLine: undefined,
    scopeLabel: undefined,
    addressLine: undefined,
    ageLabel: undefined,
    valueLabel: undefined,
    typeLabel: "Change Order",
    status: "Change Order DRAFT",
    priority: "high",
    group: "waiting",
    lens: "waiting",
    lane,
    withinLaneRank,
    filterCategory: "quotes",
    reason: rankReason || "Customer-facing scope and price amendment in progress.",
    nextStep: "Send Change Order to customer.",
    recordId: "co-1",
    parentRecordId: "job-1",
    parentLabel: "Cody Homeowner",
    leadAnchorId: undefined,
    href: "/jobs/job-1/change-orders?focus=co-1",
    updatedAt: updatedAt.toISOString(),
    workflowNextActionType: undefined,
    workflowNextActionLabel: undefined,
    actionKind: undefined,
    actionLabel: undefined,
    actionIssueId: undefined,
    actionTaskId: undefined,
  });
});

test("change-order integration parity: sent waiting for customer", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.SENT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  const priority = attention.priority;
  const group = "waiting" as const;
  const { lane, withinLaneRank, reason: rankReason } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapCoViaAdapter({
    changeOrderId: "co-2",
    number: 2,
    title: "Extra outlet",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    customerLabel: null,
    status: ChangeOrderStatus.SENT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason,
    rank: { priority, group, lens: attention.lens, lane, withinLaneRank },
  });

  assert.equal(mapped.status, "Change Order SENT");
  assert.equal(mapped.nextStep, "Await customer acceptance.");
  assert.equal(mapped.subtitle, "Kitchen remodel");
});

test("change-order integration parity: accepted not applied", () => {
  const attention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  const priority = attention.priority;
  const group = "ready" as const;
  const { lane, withinLaneRank, reason: rankReason } = rank(
    { kind: "quote", priority, group, updatedAt },
    role,
    now,
  );

  const mapped = mapCoViaAdapter({
    changeOrderId: "co-3",
    number: 3,
    title: "Panel upgrade",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    customerLabel: "Cody Homeowner",
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason,
    rank: { priority, group, lens: attention.lens, lane, withinLaneRank },
  });

  assert.equal(mapped.id, "change-order-co-3");
  assert.equal(mapped.status, "Change Order ACCEPTED");
  assert.equal(mapped.nextStep, "Apply accepted Change Order.");
  assert.equal(mapped.group, "ready");
  assert.equal(mapped.priority, "critical");
});

test("change-order integration parity: customer requested changes and execution review", () => {
  const requested = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
  });
  const review = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
  });

  const requestedMapped = mapCoViaAdapter({
    changeOrderId: "co-4",
    number: 4,
    title: "Trim change",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rank: {
      priority: requested.priority,
      group: "waiting",
      lens: requested.lens,
      lane: "upcoming",
      withinLaneRank: 10,
    },
  });
  assert.equal(requestedMapped.status, "Customer requested CO changes");

  const reviewMapped = mapCoViaAdapter({
    changeOrderId: "co-5",
    number: 5,
    title: "Scope add",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
    updatedAt,
    rank: {
      priority: review.priority,
      group: "investigate",
      lens: review.lens,
      lane: "critical",
      withinLaneRank: 1,
    },
  });
  assert.equal(reviewMapped.status, "Change Order needs execution review");
  assert.equal(reviewMapped.group, "investigate");
});

test("change-order integration parity: apply failed and send blockers keep queue copy", () => {
  const failedAttention = deriveChangeOrderWorkstationAttention({
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
  });
  const failedPriority = failedAttention.priority;
  const failedGroup = "investigate" as const;
  const { lane: failedLane, withinLaneRank: failedRank, reason: failedRankReason } = rank(
    { kind: "quote", priority: failedPriority, group: failedGroup, updatedAt },
    role,
    now,
  );

  const failed = mapCoViaAdapter({
    changeOrderId: "co-6",
    number: 6,
    title: "Stale apply",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    status: ChangeOrderStatus.ACCEPTED,
    applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
    updatedAt,
    applyBlockedReason: "The saved execution plan is stale; review before applying.",
    rankReason: failedRankReason,
    rank: {
      priority: failedPriority,
      group: failedGroup,
      lens: failedAttention.lens,
      lane: failedLane,
      withinLaneRank: failedRank,
    },
  });
  assert.equal(failed.status, "Change Order apply failed");
  assert.equal(failed.reason, failedRankReason);

  const paymentBlocked = mapCoViaAdapter({
    changeOrderId: "co-7",
    number: 7,
    title: "Price change",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    status: ChangeOrderStatus.DRAFT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason: "Needs attention.",
    sendBlockers: [
      coBlocker(
        "PAYMENT_IMPACT",
        "The customer payment terms changed and must be saved before sending.",
        "Save commercial changes",
      ),
    ],
    rank: {
      priority: "high",
      group: "waiting",
      lens: "waiting",
      lane: "upcoming",
      withinLaneRank: 20,
    },
  });
  assert.equal(paymentBlocked.reason, "Needs attention.");
  assert.equal(paymentBlocked.status, "Change Order DRAFT");

  const noWorkImpact = mapCoViaAdapter({
    changeOrderId: "co-8",
    number: 8,
    title: "Price only",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    status: ChangeOrderStatus.DRAFT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason: "Needs attention.",
    sendBlockers: [
      coBlocker(
        "CONFIRM_NO_WORK_IMPACT",
        "Confirm this price-only Change Order does not change the work plan.",
        "Confirm no work impact",
      ),
    ],
    rank: {
      priority: "high",
      group: "waiting",
      lens: "waiting",
      lane: "upcoming",
      withinLaneRank: 21,
    },
  });
  assert.equal(noWorkImpact.reason, "Needs attention.");

  const stalePlan = mapCoViaAdapter({
    changeOrderId: "co-9",
    number: 9,
    title: "Drifted plan",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    status: ChangeOrderStatus.DRAFT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason: "Needs attention.",
    sendBlockers: [
      coBlocker(
        "STALE_PLAN",
        "The execution impact is stale because the job plan changed.",
        "Review work impact",
      ),
    ],
    rank: {
      priority: "high",
      group: "waiting",
      lens: "waiting",
      lane: "upcoming",
      withinLaneRank: 22,
    },
  });
  assert.equal(stalePlan.reason, "Needs attention.");
});
