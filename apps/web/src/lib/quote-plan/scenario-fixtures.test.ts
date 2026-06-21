import assert from "node:assert/strict";
import test from "node:test";
import {
  JobScopeItemStatus,
  JobTaskStatus,
  QuoteExecutionPlanStatus,
  TaskTemplateCategory,
} from "@prisma/client";
import { computeQuotePlanningInputHash } from "@/lib/quote-plan/planning-input-hash";
import type { QuotePlanCriticalContext } from "@/lib/quote-plan/quote-plan-context";
import { validateQuotePlanProposalForApply } from "@/lib/quote-plan/quote-plan-validation";
import type { QuotePlanProposal } from "@/lib/quote-plan/quote-plan-proposal-schema";
import { validateScopeRevisionPaymentImpact } from "@/lib/quote-scope-revision-payment-policy";
import { validateScopeRevisionApplyGuards } from "@/lib/quote-scope-revision-apply-guards";

function makeCritical(lines: QuotePlanCriticalContext["lines"]): QuotePlanCriticalContext {
  return {
    quoteId: "q-scenario",
    organizationId: "org-1",
    quoteStatus: "APPROVED",
    lines,
    serviceLocation: {
      detailsStatus: "USER_REVIEWED",
      apn: "111-222-333",
      utilityName: "PG&E",
      jurisdictionName: "San Jose",
    },
    businessProfile: {
      trades: ["SOLAR"],
      workTypes: ["INSTALLATION"],
      customerMarkets: ["RESIDENTIAL"],
      operatingModel: "EMPLOYEES",
      teamSize: "SIX_TO_FIFTEEN",
    },
  };
}

function makeProposal(lineItemIds: string[]): QuotePlanProposal {
  return {
    quoteId: "q-scenario",
    schemaVersion: 1,
    plannerVersion: "scenario-fixture",
    basePlanVersion: 3,
    generatedAgainstInputHash: "hash-a",
    summary: "scenario",
    assumptions: [],
    warnings: [],
    operations: [
      {
        opId: "op-1",
        type: "ADD_TASK",
        task: {
          title: "Install work",
          category: TaskTemplateCategory.GENERAL,
          lineItemIds,
          stageId: "stage-1",
          instructions: null,
          providesSignals: ["install-ready"],
          requiresSignals: [],
          hardSignal: false,
          requirementsJson: {},
          partsRequiredJson: {},
          planningTags: [],
          sourceType: "CUSTOM",
          sourceTaskTemplateId: null,
          origin: "MANUAL",
          protected: false,
        },
      },
    ],
  };
}

test("Scenario A — single-line service plan validates", () => {
  const proposal = makeProposal(["line-a"]);
  const result = validateQuotePlanProposalForApply(proposal, {
    quoteId: "q-scenario",
    allowedLineItemIds: new Set(["line-a"]),
    executionRelevantLineItemIds: new Set(["line-a"]),
    plan: {
      status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
      planVersion: 3,
      planningInputHash: "hash-a",
    },
    currentPlanningInputHash: "hash-a",
    existingTasks: [],
  });
  assert.equal(result.ok, true);
});

test("Scenario B — shared solar+battery coordination task validates", () => {
  const result = validateQuotePlanProposalForApply(makeProposal(["line-solar", "line-battery"]), {
    quoteId: "q-scenario",
    allowedLineItemIds: new Set(["line-solar", "line-battery"]),
    executionRelevantLineItemIds: new Set(["line-solar", "line-battery"]),
    plan: {
      status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
      planVersion: 3,
      planningInputHash: "hash-a",
    },
    currentPlanningInputHash: "hash-a",
    existingTasks: [],
  });
  assert.equal(result.ok, true);
});

test("Scenario C — three-scope coordinated planning validates", () => {
  const result = validateQuotePlanProposalForApply(makeProposal(["line-1", "line-2", "line-3"]), {
    quoteId: "q-scenario",
    allowedLineItemIds: new Set(["line-1", "line-2", "line-3"]),
    executionRelevantLineItemIds: new Set(["line-1", "line-2", "line-3"]),
    plan: {
      status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
      planVersion: 3,
      planningInputHash: "hash-a",
    },
    currentPlanningInputHash: "hash-a",
    existingTasks: [],
  });
  assert.equal(result.ok, true);
});

test("Scenario D — pre-activation scope add changes input hash", () => {
  const before = makeCritical([
    {
      id: "line-1",
      sortOrder: 0,
      description: "Solar",
      quantity: "1",
      unitAmountCents: 100,
      executionRelevant: true,
      clarifications: [],
    },
  ]);
  const after = makeCritical([
    ...before.lines,
    {
      id: "line-2",
      sortOrder: 1,
      description: "Battery",
      quantity: "1",
      unitAmountCents: 200,
      executionRelevant: true,
      clarifications: [],
    },
  ]);
  assert.notEqual(computeQuotePlanningInputHash(before, 1), computeQuotePlanningInputHash(after, 1));
});

test("Scenario E — pre-activation scope remove changes input hash", () => {
  const before = makeCritical([
    {
      id: "line-1",
      sortOrder: 0,
      description: "Solar",
      quantity: "1",
      unitAmountCents: 100,
      executionRelevant: true,
      clarifications: [],
    },
    {
      id: "line-2",
      sortOrder: 1,
      description: "Battery",
      quantity: "1",
      unitAmountCents: 200,
      executionRelevant: true,
      clarifications: [],
    },
  ]);
  const after = makeCritical([before.lines[0]!]);
  assert.notEqual(computeQuotePlanningInputHash(before, 1), computeQuotePlanningInputHash(after, 1));
});

test("Scenario F — post-activation non-zero payment delta is blocked without approved op", () => {
  const result = validateScopeRevisionPaymentImpact({
    priceDeltaCents: 1000,
    hasApprovedPaymentImpactOperationInTx: false,
  });
  assert.equal(result.ok, false);
});

test("Scenario G — dependency-safe cancellation rejects hard-signal orphan", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "scope-1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "provider",
        status: JobTaskStatus.CANCELED,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: ["permit-ready"],
        jobScopeItemIds: ["scope-1"],
      },
      {
        id: "consumer",
        status: JobTaskStatus.TODO,
        hardSignal: true,
        requiresSignals: ["permit-ready"],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
  });
  assert.equal(result.ok, false);
});

test("Scenario H — scope coverage invariant passes with active linked task", () => {
  const result = validateScopeRevisionApplyGuards({
    priceDeltaCents: 0,
    hasApprovedPaymentImpactOperationInTx: false,
    scopeItems: [{ id: "scope-1", executionRelevant: true, status: JobScopeItemStatus.ACTIVE }],
    tasks: [
      {
        id: "task-1",
        status: JobTaskStatus.TODO,
        hardSignal: false,
        requiresSignals: [],
        providesSignals: [],
        jobScopeItemIds: ["scope-1"],
      },
    ],
  });
  assert.equal(result.ok, true);
});

test("Scenario I — protected task cannot be mutated by proposal", () => {
  const proposal = {
    quoteId: "q-scenario",
    schemaVersion: 1,
    plannerVersion: "scenario-fixture",
    basePlanVersion: 3,
    generatedAgainstInputHash: "hash-a",
    summary: "mutate protected",
    assumptions: [],
    warnings: [],
    operations: [
      {
        opId: "op-protected",
        type: "UPDATE_TASK",
        taskId: "t-protected",
        task: { title: "new title" },
      },
    ],
  } as const;
  const result = validateQuotePlanProposalForApply(proposal, {
    quoteId: "q-scenario",
    allowedLineItemIds: new Set(["line-a"]),
    executionRelevantLineItemIds: new Set(["line-a"]),
    plan: {
      status: QuoteExecutionPlanStatus.READY_FOR_REVIEW,
      planVersion: 3,
      planningInputHash: "hash-a",
    },
    currentPlanningInputHash: "hash-a",
    existingTasks: [
      {
        id: "t-protected",
        protectedAt: new Date(),
        humanEditedAt: null,
        lineItemIds: ["line-a"],
        requiresSignals: [],
        providesSignals: [],
        hardSignal: false,
      },
    ],
  });
  assert.equal(result.ok, false);
});

