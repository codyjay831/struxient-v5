import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspaceQuoteId } from "./opportunity-workspace-quote-id";
import type { OpportunityFlowView } from "./opportunity-flow";

const baseFlow = (overrides: Partial<OpportunityFlowView> = {}): OpportunityFlowView =>
  ({
    phase: "ESTIMATING",
    conditionCode: "QUOTE_DRAFT_IN_PROGRESS",
    conditionLabel: "Draft",
    conditionStartedAt: null,
    ageLabel: null,
    summary: "Draft in progress",
    requirements: [],
    satisfiedItems: [],
    primaryAction: null,
    secondaryActions: [],
    facts: [],
    events: [],
    ...overrides,
  }) as OpportunityFlowView;

test("resolveWorkspaceQuoteId prefers flow target quote", () => {
  const quoteId = resolveWorkspaceQuoteId(
    baseFlow({
      primaryAction: {
        kind: "OPEN_DRAFT_QUOTE",
        label: "Continue",
        targetQuoteId: "draft-1",
      },
    }),
    [
      {
        id: "sent-1",
        title: "Sent",
        status: "SENT",
        totalCents: 1000,
        _count: { lineItems: 1 },
      },
      {
        id: "draft-1",
        title: "Draft",
        status: "DRAFT",
        totalCents: 0,
        _count: { lineItems: 0 },
      },
    ],
  );
  assert.equal(quoteId, "draft-1");
});

test("resolveWorkspaceQuoteId falls back to newest draft then working quote", () => {
  assert.equal(
    resolveWorkspaceQuoteId(baseFlow(), [
      {
        id: "draft-2",
        title: "Draft",
        status: "DRAFT",
        totalCents: 0,
        _count: { lineItems: 0 },
      },
    ]),
    "draft-2",
  );
  assert.equal(
    resolveWorkspaceQuoteId(baseFlow(), [
      {
        id: "sent-1",
        title: "Sent",
        status: "SENT",
        totalCents: 1000,
        _count: { lineItems: 1 },
      },
    ]),
    "sent-1",
  );
});
