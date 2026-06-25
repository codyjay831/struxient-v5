import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderLineOperation } from "@prisma/client";
import {
  CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  type ChangeOrderExecutionDeltaProposal,
} from "@/lib/change-order/execution-delta-schema";
import {
  commercialDraftChanged,
  executionDraftChanged,
  getUnsavedDraftChangesReason,
  MIXED_DRAFT_SAVE_BLOCKED_MESSAGE,
  paymentImpactDraftChanged,
  resolveDraftUpdateSaveIntent,
  UNSAVED_EXECUTION_IMPACT_BANNER,
} from "./change-order-draft-save-semantics";
import type { ChangeOrderLineDraft } from "@/lib/change-order-flow";

const baselineLines: ChangeOrderLineDraft[] = [
  {
    operation: ChangeOrderLineOperation.ADD,
    description: "Battery",
    quantity: "1",
    priceDeltaCents: 0,
    executionRelevant: true,
  },
];

const baselineProposal: ChangeOrderExecutionDeltaProposal = {
  schemaVersion: CHANGE_ORDER_EXECUTION_DELTA_SCHEMA_VERSION,
  baseJobPlanVersion: 1,
  operations: [
    {
      opId: "task:line-1",
      type: "ADD_TASK",
      targetEntityType: "JobTask",
      reason: "Generated",
      internalNote: "Generated from the commercial Change Order line.",
      payload: { title: "Execute change: Battery" },
    },
  ],
};

test("mixed commercial and execution edits are blocked from one save", () => {
  const intent = resolveDraftUpdateSaveIntent({
    commercialChanged: true,
    executionChanged: true,
  });
  assert.equal(intent.kind, "blocked_mixed");
  if (intent.kind === "blocked_mixed") {
    assert.equal(intent.message, MIXED_DRAFT_SAVE_BLOCKED_MESSAGE);
  }
});

test("commercial-only save intent is allowed without execution override", () => {
  const intent = resolveDraftUpdateSaveIntent({
    commercialChanged: true,
    executionChanged: false,
  });
  assert.equal(intent.kind, "commercial_only");
});

test("execution-only save intent is allowed without commercial regeneration conflict", () => {
  const intent = resolveDraftUpdateSaveIntent({
    commercialChanged: false,
    executionChanged: true,
  });
  assert.equal(intent.kind, "execution_only");
});

test("payment-impact-only save intent routes to commercial save", () => {
  const intent = resolveDraftUpdateSaveIntent({
    commercialChanged: false,
    executionChanged: false,
    paymentImpactChanged: true,
  });
  assert.equal(intent.kind, "commercial_only");
});

test("payment impact plus execution edits are blocked from one save", () => {
  const intent = resolveDraftUpdateSaveIntent({
    commercialChanged: false,
    executionChanged: true,
    paymentImpactChanged: true,
  });
  assert.equal(intent.kind, "blocked_mixed");
});

test("paymentImpactDraftChanged detects v2 payment plan selection", () => {
  const baseline = null;
  const selected = {
    schemaVersion: 2,
    strategy: "SPLIT_ACROSS_REMAINING_PAYMENTS",
    customerTermsText: "Spread across remaining payments.",
    allocations: [],
    resolvedPreview: {
      strategyLabel: "Spread across remaining payments",
      customerSummary: "Spread across remaining payments.",
    },
  };
  assert.equal(
    paymentImpactDraftChanged({ baselinePaymentImpactJson: baseline, paymentImpactJson: selected }),
    true,
  );
});

test("commercialDraftChanged ignores whitespace-only reasoning changes", () => {
  assert.equal(
    commercialDraftChanged({
      baselineReasoning: "Reason",
      baselineLines,
      reasoning: " Reason ",
      lines: baselineLines,
    }),
    false,
  );
});

test("executionDraftChanged detects manual task edits", () => {
  const edited: ChangeOrderExecutionDeltaProposal = {
    ...baselineProposal,
    operations: baselineProposal.operations.map((operation) => ({
      ...operation,
      internalNote: "Reviewed by office.",
    })),
  };
  assert.equal(
    executionDraftChanged({
      baselineProposal,
      proposal: edited,
    }),
    true,
  );
});

test("getUnsavedDraftChangesReason blocks send until execution is saved", () => {
  assert.equal(
    getUnsavedDraftChangesReason({ commercialChanged: false, executionChanged: true }),
    "Save execution impact before sending.",
  );
  assert.equal(
    getUnsavedDraftChangesReason({ commercialChanged: true, executionChanged: false }),
    "Save commercial changes before sending.",
  );
  assert.equal(
    getUnsavedDraftChangesReason({ commercialChanged: true, executionChanged: true }),
    MIXED_DRAFT_SAVE_BLOCKED_MESSAGE,
  );
  assert.equal(
    getUnsavedDraftChangesReason({ commercialChanged: false, executionChanged: false, paymentImpactChanged: true }),
    "Save payment impact before sending.",
  );
});

test("unsaved execution banner copy is contractor-readable", () => {
  assert.match(UNSAVED_EXECUTION_IMPACT_BANNER, /unsaved work impact/i);
  assert.match(UNSAVED_EXECUTION_IMPACT_BANNER, /Save execution impact/i);
});
