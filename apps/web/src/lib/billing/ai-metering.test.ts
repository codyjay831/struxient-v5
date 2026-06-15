import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractGeminiUsageFromRestPayload,
  sumGeminiTokenUsage,
} from "@/lib/ai/gemini-generate-content";
import { estimateGeminiCostCents } from "@/lib/billing/billing-ai-cost-config";
import { isAiMeteringShadowMode } from "@/lib/billing/ai-metering-config";
import { computeBillableUnits } from "@/lib/billing/billing-periods";

describe("gemini-generate-content", () => {
  it("extracts usage metadata from REST payload", () => {
    const usage = extractGeminiUsageFromRestPayload({
      usageMetadata: {
        promptTokenCount: 1200,
        candidatesTokenCount: 300,
        totalTokenCount: 1500,
      },
    });
    assert.deepEqual(usage, {
      promptTokenCount: 1200,
      candidatesTokenCount: 300,
      totalTokenCount: 1500,
    });
  });

  it("sums token usage across calls", () => {
    const total = sumGeminiTokenUsage([
      { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 },
      { promptTokenCount: 200, candidatesTokenCount: 100, totalTokenCount: 300 },
    ]);
    assert.equal(total.promptTokenCount, 300);
    assert.equal(total.candidatesTokenCount, 150);
    assert.equal(total.totalTokenCount, 450);
  });
});

describe("billing-ai-cost-config", () => {
  it("estimates non-zero cost for token usage", () => {
    const cents = estimateGeminiCostCents({
      usage: {
        promptTokenCount: 10_000,
        candidatesTokenCount: 5_000,
        totalTokenCount: 15_000,
      },
      model: "gemini-2.5-flash",
    });
    assert.ok(cents > 0);
  });

  it("adds grounding surcharge when configured", () => {
    const without = estimateGeminiCostCents({
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        totalTokenCount: 1500,
      },
      model: "gemini-2.5-flash",
      groundedSearchCallCount: 0,
    });
    const withGrounding = estimateGeminiCostCents({
      usage: {
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        totalTokenCount: 1500,
      },
      model: "gemini-2.5-flash",
      groundedSearchCallCount: 2,
    });
    assert.ok(withGrounding > without);
  });
});

describe("ai-metering-config", () => {
  it("defaults shadow mode off when env unset", () => {
    const previous = process.env.AI_METERING_SHADOW;
    delete process.env.AI_METERING_SHADOW;
    assert.equal(isAiMeteringShadowMode(), false);
    process.env.AI_METERING_SHADOW = previous;
  });
});

describe("computeBillableUnits with real tokens", () => {
  it("charges two units for 1500 combined tokens", () => {
    assert.equal(computeBillableUnits(1000, 500), 2);
  });
});
