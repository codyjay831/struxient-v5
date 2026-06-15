import type { GeminiCallBreakdownEntry, GeminiTokenUsage } from "./gemini-generate-content";
import { sumGeminiTokenUsage } from "./gemini-generate-content";
import { estimateGeminiCostCents } from "@/lib/billing/billing-ai-cost-config";

export type AiMeteringMetadata = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  model: string;
  callBreakdown?: GeminiCallBreakdownEntry[];
  tokenSource: "provider" | "estimated";
};

export class AiTokenAccumulator {
  private readonly breakdown: GeminiCallBreakdownEntry[] = [];

  add(stage: string, usage: GeminiTokenUsage | null | undefined): void {
    if (!usage) return;
    this.breakdown.push({
      stage,
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount,
    });
  }

  get aggregated(): GeminiTokenUsage {
    return sumGeminiTokenUsage(this.breakdown);
  }

  build(params: {
    model: string;
    groundedSearchCallCount?: number;
    tokenSource?: "provider" | "estimated";
  }): AiMeteringMetadata {
    const usage = this.aggregated;
    return {
      inputTokens: usage.promptTokenCount,
      outputTokens: usage.candidatesTokenCount,
      estimatedCostCents: estimateGeminiCostCents({
        usage,
        model: params.model,
        groundedSearchCallCount: params.groundedSearchCallCount,
      }),
      model: params.model,
      callBreakdown: this.breakdown.length > 0 ? [...this.breakdown] : undefined,
      tokenSource: params.tokenSource ?? (this.breakdown.length > 0 ? "provider" : "estimated"),
    };
  }
}

export function buildAiMeteringMetadata(params: {
  usage: GeminiTokenUsage | null;
  model: string;
  estimatedCostCents: number;
  callBreakdown?: GeminiCallBreakdownEntry[];
  tokenSource?: "provider" | "estimated";
}): AiMeteringMetadata {
  return {
    inputTokens: params.usage?.promptTokenCount ?? 0,
    outputTokens: params.usage?.candidatesTokenCount ?? 0,
    estimatedCostCents: params.estimatedCostCents,
    model: params.model,
    callBreakdown: params.callBreakdown,
    tokenSource: params.tokenSource ?? (params.usage ? "provider" : "estimated"),
  };
}

export function meteringToExecuteResult(metering: AiMeteringMetadata) {
  return {
    inputTokens: metering.inputTokens,
    outputTokens: metering.outputTokens,
    estimatedCostCents: metering.estimatedCostCents,
    responsePayload: metering.callBreakdown?.length
      ? ({
          callBreakdown: metering.callBreakdown,
          tokenSource: metering.tokenSource,
        } as const)
      : undefined,
  };
}
