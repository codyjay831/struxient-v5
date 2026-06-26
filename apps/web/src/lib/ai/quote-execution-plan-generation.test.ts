import assert from "node:assert/strict";
import test from "node:test";
import { AIService } from "@/lib/ai/ai-service";
import { QuotePlanProposalSchema } from "@/lib/quote-plan/quote-plan-proposal-schema";
import { shouldOpenQuotePlanProposalReview } from "@/lib/quote-plan/proposal-guards";

test("generateQuoteExecutionPlan creates a useful scoped proposal for Roof Replacement in test simulation", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousSim = process.env.AI_ALLOW_SIMULATED_EXECUTION_PLANS;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.GEMINI_API_KEY;
  Reflect.set(process.env, "NODE_ENV", "test");
  process.env.AI_ALLOW_SIMULATED_EXECUTION_PLANS = "1";

  try {
    const result = await AIService.generateQuoteExecutionPlan({
      quoteId: "quote-roof",
      quoteTitle: "Roof Replacement",
      organizationId: "org-1",
      organizationName: "Test Roofing Co",
      existingStages: [{ id: "stage-production", name: "Production" }],
      lines: [
        {
          id: "line-roof",
          description: "Roof Replacement",
          executionRelevant: true,
          clarifications: [],
        },
      ],
    });

    assert.ok(result.metering, "simulated generation should include metering metadata");
    assert.equal(result.proposal.tasks.length >= 8, true);
    assert.equal(
      result.proposal.tasks.every((task) => task.lineItemIds.includes("line-roof")),
      true,
    );
    assert.equal(
      result.proposal.tasks.every((task) => task.stageId === "stage-production"),
      true,
    );
    assert.ok(result.proposal.tasks.some((task) => /tear off/i.test(task.title)));
    assert.ok(result.proposal.tasks.some((task) => /underlayment|flashing/i.test(task.title)));

    const quotePlanProposal = QuotePlanProposalSchema.parse({
      quoteId: "quote-roof",
      schemaVersion: 1,
      plannerVersion: "whole-quote-ai-v1",
      generatedAgainstInputHash: "hash-roof",
      basePlanVersion: 1,
      summary: result.proposal.summary,
      assumptions: result.proposal.assumptions,
      warnings: result.proposal.warnings,
      operations: result.proposal.tasks.map((task, index) => ({
        opId: `ai-add-${index + 1}`,
        type: "ADD_TASK",
        reason: "Whole-quote AI proposal",
        task: {
          title: task.title,
          category: task.category,
          stageId: task.stageId,
          instructions: task.instructions ?? null,
          requiresSignals: task.requiresSignals,
          providesSignals: task.providesSignals,
          hardSignal: task.hardSignal,
          sourceTaskTemplateId: task.sourceTaskTemplateId ?? null,
          sourceType: "CUSTOM",
          origin: "AI_PLAN",
          lineItemIds: task.lineItemIds,
        },
      })),
    });

    assert.equal(quotePlanProposal.operations.length > 0, true);
    assert.equal(shouldOpenQuotePlanProposalReview(quotePlanProposal), true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousKey;
    }
    if (previousSim === undefined) {
      delete process.env.AI_ALLOW_SIMULATED_EXECUTION_PLANS;
    } else {
      process.env.AI_ALLOW_SIMULATED_EXECUTION_PLANS = previousSim;
    }
    if (previousNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
    }
  }
});
