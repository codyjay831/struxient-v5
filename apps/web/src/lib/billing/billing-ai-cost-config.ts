import type { GeminiTokenUsage } from "@/lib/ai/gemini-generate-content";
import { normalizeGeminiModelId } from "@/lib/ai/gemini-generate-content";

/** Cents per 1M tokens — internal cost estimation only, not customer billing. */
export type GeminiModelCostRates = {
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
  /** Flat surcharge per request when google_search grounding tool is used. */
  groundingSearchCentsPerRequest?: number;
};

const DEFAULT_FLASH_RATES: GeminiModelCostRates = {
  inputCentsPerMillion: 15,
  outputCentsPerMillion: 60,
  groundingSearchCentsPerRequest: 35,
};

const MODEL_COST_RATES: Record<string, GeminiModelCostRates> = {
  "gemini-2.5-flash": DEFAULT_FLASH_RATES,
  "gemini-2.0-flash": DEFAULT_FLASH_RATES,
  "gemini-2.5-flash-lite": {
    inputCentsPerMillion: 8,
    outputCentsPerMillion: 30,
  },
};

export function getGeminiModelCostRates(model: string): GeminiModelCostRates {
  const normalized = normalizeGeminiModelId(model);
  return MODEL_COST_RATES[normalized] ?? DEFAULT_FLASH_RATES;
}

export function estimateGeminiCostCents(params: {
  usage: GeminiTokenUsage | null;
  model: string;
  groundedSearchCallCount?: number;
}): number {
  if (!params.usage) return 0;
  const rates = getGeminiModelCostRates(params.model);
  const inputCost =
    (params.usage.promptTokenCount / 1_000_000) * rates.inputCentsPerMillion;
  const outputCost =
    (params.usage.candidatesTokenCount / 1_000_000) * rates.outputCentsPerMillion;
  const groundingCost =
    (params.groundedSearchCallCount ?? 0) *
    (rates.groundingSearchCentsPerRequest ?? 0);
  return Math.max(0, Math.ceil(inputCost + outputCost + groundingCost));
}
