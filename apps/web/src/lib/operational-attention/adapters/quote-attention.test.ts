import assert from "node:assert/strict";
import test from "node:test";
import { JobStatus, QuoteStatus } from "@prisma/client";
import { getQuoteReadiness, type QuoteReadiness } from "@/lib/quote-readiness";
import { mapAttentionItemToWorkstationWorkItem } from "../workstation-mapper";
import {
  buildQuoteOperationalAttentionItems,
  type QuoteAttentionInput,
} from "./quote-attention";

const updatedAt = new Date("2026-06-26T12:00:00.000Z");

function readinessFor(status: QuoteStatus, ready: boolean | null): QuoteReadiness {
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

function quoteInput(overrides: Partial<QuoteAttentionInput> = {}): QuoteAttentionInput {
  const readiness = overrides.readiness ?? readinessFor(QuoteStatus.APPROVED, true);
  return {
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
    status: QuoteStatus.APPROVED,
    rank: {
      priority: "critical",
      group: "investigate",
      lens: "attention",
      lane: "critical",
      withinLaneRank: 12,
    },
    ...overrides,
  };
}

test("quote adapter maps approved ready-to-activate quote to current Workstation quote DTO", () => {
  const [attention] = buildQuoteOperationalAttentionItems(quoteInput());
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.id, "quote_activation:quote-1");
  assert.equal(attention.kind, "quote_activation");
  assert.equal(attention.severity, "critical");
  assert.ok(item);
  assert.equal(item.id, "quote-quote-1");
  assert.equal(item.kind, "quote");
  assert.equal(item.status, QuoteStatus.APPROVED);
  assert.equal(item.reason, "Approved quote is waiting for job setup.");
  assert.equal(item.nextStep, "Activate job");
  assert.equal(item.priority, "critical");
  assert.equal(item.group, "investigate");
  assert.equal(item.lens, "attention");
  assert.equal(item.lane, "critical");
  assert.equal(item.filterCategory, "quotes");
  assert.equal(item.href, "/leads/lead-1?tab=quote");
  assert.equal(item.leadAnchorId, "lead-1");
  assert.equal(item.workflow?.nextAction?.type, "ACTIVATE_JOB");
});

test("quote adapter preserves missing execution plan handoff copy from quote readiness", () => {
  const [attention] = buildQuoteOperationalAttentionItems(
    quoteInput({
      readiness: readinessFor(QuoteStatus.APPROVED, false),
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "quote_activation");
  assert.equal(attention.severity, "critical");
  assert.ok(item);
  assert.equal(item.id, "quote-quote-1");
  assert.equal(item.reason, "Approved quote is waiting for job setup.");
  assert.equal(item.nextStep, "Build execution plan");
  assert.equal(item.workflow?.nextAction?.type, "OPEN_EXECUTION_REVIEW");
});

test("quote adapter represents stale or invalid execution review without renaming Workstation state", () => {
  const [attention] = buildQuoteOperationalAttentionItems(
    quoteInput({
      readiness: readinessFor(QuoteStatus.APPROVED, false),
      reason: "Needs attention.",
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "quote_activation");
  assert.ok(item);
  assert.equal(item.status, QuoteStatus.APPROVED);
  assert.equal(item.reason, "Approved quote is waiting for job setup.");
  assert.equal(item.nextStep, "Build execution plan");
});

test("quote adapter preserves customer-requested-changes Workstation overlays", () => {
  const [attention] = buildQuoteOperationalAttentionItems(
    quoteInput({
      openChangeRequest: { requiresVisit: true },
      readiness: readinessFor(QuoteStatus.SENT, null),
      status: QuoteStatus.SENT,
      rank: {
        priority: "critical",
        group: "investigate",
        lens: "attention",
        lane: "critical",
        withinLaneRank: 4,
      },
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "quote_revision");
  assert.equal(attention.reason, "Customer requested changes and follow-up visit may be required.");
  assert.ok(item);
  assert.equal(item.id, "quote-quote-1");
  assert.equal(item.status, "Customer requested changes");
  assert.equal(item.reason, "Customer requested changes and follow-up visit may be required.");
  assert.equal(item.nextStep, "Create revision draft.");
});

test("quote adapter preserves revision-draft continuation state", () => {
  const [attention] = buildQuoteOperationalAttentionItems(
    quoteInput({
      openChangeRequest: { requiresVisit: false, draftRevisionLineItemCount: 2 },
      readiness: readinessFor(QuoteStatus.SENT, null),
      status: QuoteStatus.SENT,
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "quote_revision");
  assert.ok(item);
  assert.equal(item.status, "Revision ready to send");
  assert.equal(item.reason, "Customer requested changes on this quote.");
  assert.equal(item.nextStep, "Continue revision draft.");
});

test("quote adapter preserves sent waiting state without inventing new labels", () => {
  const [attention] = buildQuoteOperationalAttentionItems(
    quoteInput({
      readiness: readinessFor(QuoteStatus.SENT, null),
      status: QuoteStatus.SENT,
      reason: "Needs attention.",
      rank: {
        priority: "low",
        group: "ready",
        lens: "attention",
        lane: "upcoming",
        withinLaneRank: 99,
      },
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "quote_activation");
  assert.equal(attention.severity, "attention");
  assert.ok(item);
  assert.equal(item.id, "quote-quote-1");
  assert.equal(item.status, QuoteStatus.SENT);
  assert.equal(item.reason, "Needs attention.");
  assert.equal(item.nextStep, "Mark approved");
  assert.equal(item.workflow?.nextAction?.type, "MARK_APPROVED");
});

test("quote readiness helper still treats active jobs as terminal-to-Workstation skip candidate", () => {
  const readiness = getQuoteReadiness({
    quote: {
      status: QuoteStatus.APPROVED,
      lineItemCount: 2,
      subtotalCents: 100_000,
      totalCents: 100_000,
    },
    job: { id: "job-1", status: JobStatus.ACTIVE },
    activationReadiness: null,
  });

  assert.equal(readiness.state, "JOB_ACTIVE");
});
