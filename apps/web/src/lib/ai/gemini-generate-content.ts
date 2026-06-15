import type { GenerateContentResult } from "@google/generative-ai";

/** Normalized token counts from Gemini usageMetadata (REST or SDK). */
export type GeminiTokenUsage = {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
};

export type GeminiCallBreakdownEntry = {
  stage: string;
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
};

export type GeminiGenerateContentResult = {
  text: string;
  usage: GeminiTokenUsage | null;
  model: string;
  elapsedMs: number;
};

const EMPTY_USAGE: GeminiTokenUsage = {
  promptTokenCount: 0,
  candidatesTokenCount: 0,
  totalTokenCount: 0,
};

export function normalizeGeminiModelId(value: string): string {
  return value.trim().replace(/^models\//i, "");
}

export function buildGeminiGenerateContentEndpoint(params: {
  apiKey: string;
  model: string;
}): { endpoint: string; sanitizedEndpoint: string; normalizedModel: string } {
  const normalizedModel = normalizeGeminiModelId(params.model);
  const modelPath = encodeURIComponent(normalizedModel);
  return {
    endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
    sanitizedEndpoint: `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:generateContent?key=[REDACTED]`,
    normalizedModel,
  };
}

type RawUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
};

export function extractGeminiUsageMetadata(
  source: RawUsageMetadata | null | undefined,
): GeminiTokenUsage | null {
  if (!source) return null;
  const promptTokenCount = source.promptTokenCount ?? 0;
  const candidatesTokenCount = source.candidatesTokenCount ?? 0;
  const totalTokenCount =
    source.totalTokenCount ?? promptTokenCount + candidatesTokenCount;
  if (promptTokenCount === 0 && candidatesTokenCount === 0 && totalTokenCount === 0) {
    return null;
  }
  return { promptTokenCount, candidatesTokenCount, totalTokenCount };
}

export function extractGeminiUsageFromSdkResponse(
  response: GenerateContentResult["response"],
): GeminiTokenUsage | null {
  return extractGeminiUsageMetadata(response.usageMetadata ?? null);
}

export function extractGeminiUsageFromRestPayload(payload: {
  usageMetadata?: RawUsageMetadata;
}): GeminiTokenUsage | null {
  return extractGeminiUsageMetadata(payload.usageMetadata ?? null);
}

export function sumGeminiTokenUsage(
  usages: Array<GeminiTokenUsage | null | undefined>,
): GeminiTokenUsage {
  return usages.reduce<GeminiTokenUsage>(
    (acc, usage) => {
      if (!usage) return acc;
      return {
        promptTokenCount: acc.promptTokenCount + usage.promptTokenCount,
        candidatesTokenCount: acc.candidatesTokenCount + usage.candidatesTokenCount,
        totalTokenCount: acc.totalTokenCount + usage.totalTokenCount,
      };
    },
    { ...EMPTY_USAGE },
  );
}

export function estimateTokensFromChars(inputChars: number, outputChars: number): GeminiTokenUsage {
  const promptTokenCount = Math.ceil(Math.max(0, inputChars) / 4);
  const candidatesTokenCount = Math.ceil(Math.max(0, outputChars) / 4);
  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: promptTokenCount + candidatesTokenCount,
  };
}

export function parseGeminiJsonResponse(text: string): unknown {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : text.trim();
  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    const repaired = jsonStr.replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(repaired);
    } catch {
      throw firstError;
    }
  }
}

export function extractGeminiTextFromRestPayload(payload: {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}): string {
  return (
    payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ??
    ""
  );
}

export async function fetchGeminiGenerateContent(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<GeminiGenerateContentResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const startedAt = Date.now();
  try {
    const { endpoint, normalizedModel } = buildGeminiGenerateContentEndpoint({
      apiKey: params.apiKey,
      model: params.model,
    });
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params.body),
      signal: controller.signal,
    });
    const responseText = await res.text();
    if (!res.ok) {
      throw new Error(
        `Gemini HTTP ${res.status}: ${responseText.slice(0, 500)}`,
      );
    }
    const payload = JSON.parse(responseText) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
      usageMetadata?: RawUsageMetadata;
    };
    return {
      text: extractGeminiTextFromRestPayload(payload),
      usage: extractGeminiUsageFromRestPayload(payload),
      model: normalizedModel,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function toInputOutputTokens(usage: GeminiTokenUsage | null): {
  inputTokens: number;
  outputTokens: number;
} {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  return {
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
  };
}
