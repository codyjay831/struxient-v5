type GroundedSourceLink = {
  title: string;
  url: string;
};

import {
  buildGeminiGenerateContentEndpoint,
  sanitizeProviderErrorBody,
  SiteDetailsProviderError,
} from "@/lib/ai/site-details-provider-error";
import {
  buildApprovedGroundedSources,
  type ApprovedGroundedSource,
} from "@/lib/ai/site-details-approved-sources";

export type SiteDetailsGroundedResearchResult = {
  model: string;
  originalModel: string;
  normalizedModel: string;
  endpoint: string;
  elapsedMs: number;
  groundingToolEnabled: boolean;
  groundingMetadataPresent: boolean;
  groundingSearchQueries: string[];
  approvedSources: ApprovedGroundedSource[];
  groundingSourceLinks: GroundedSourceLink[];
  groundedSummary: string;
};

type GeminiGroundingChunk = {
  web?: {
    title?: string;
    uri?: string;
    domain?: string;
  };
};

type GeminiGroundingMetadata = {
  webSearchQueries?: string[];
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: Array<{
    segment?: { text?: string };
    groundingChunkIndices?: number[];
  }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    groundingMetadata?: GeminiGroundingMetadata;
  }>;
};

export async function researchGroundedSiteDetailsSources(params: {
  apiKey: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<SiteDetailsGroundedResearchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const startedAt = Date.now();
  let timedOut = false;
  try {
    const { endpoint, sanitizedEndpoint, normalizedModel } = buildGeminiGenerateContentEndpoint({
      apiKey: params.apiKey,
      model: params.model,
    });
    const requestPayload = {
      contents: [
        {
          role: "user",
          parts: [{ text: params.prompt }],
        },
      ],
      tools: [{ google_search: {} }],
    };
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = controller.signal.aborted;
      if (aborted) {
        timedOut = true;
        throw new SiteDetailsProviderError({
          code: "PROVIDER_TIMEOUT",
          stage: "GROUNDED_RESEARCH",
          originalModel: params.model,
          normalizedModel,
          endpoint: sanitizedEndpoint,
          elapsedMs: Date.now() - startedAt,
          timedOut: true,
          aborted: true,
          responseTextExists: false,
          candidateContentExists: false,
          groundingMetadataExists: false,
        });
      }
      throw new SiteDetailsProviderError({
        code: "PROVIDER_NETWORK_ERROR",
        stage: "GROUNDED_RESEARCH",
        originalModel: params.model,
        normalizedModel,
        endpoint: sanitizedEndpoint,
        responseBody: sanitizeProviderErrorBody(error instanceof Error ? error.message : String(error)),
        elapsedMs: Date.now() - startedAt,
        timedOut: false,
        aborted: false,
        responseTextExists: false,
        candidateContentExists: false,
        groundingMetadataExists: false,
      });
    }

    const responseText = await res.text();
    if (!res.ok) {
      throw new SiteDetailsProviderError({
        code: "PROVIDER_HTTP_ERROR",
        stage: "GROUNDED_RESEARCH",
        originalModel: params.model,
        normalizedModel,
        endpoint: sanitizedEndpoint,
        status: res.status,
        statusText: res.statusText,
        responseBody: sanitizeProviderErrorBody(responseText),
        elapsedMs: Date.now() - startedAt,
        timedOut,
        aborted: controller.signal.aborted,
        responseTextExists: responseText.trim().length > 0,
        candidateContentExists: false,
        groundingMetadataExists: false,
      });
    }

    let payload: GeminiGenerateContentResponse;
    try {
      payload = JSON.parse(responseText) as GeminiGenerateContentResponse;
    } catch (error) {
      throw new SiteDetailsProviderError({
        code: "PROVIDER_RESPONSE_PARSE_ERROR",
        stage: "GROUNDED_RESEARCH",
        originalModel: params.model,
        normalizedModel,
        endpoint: sanitizedEndpoint,
        status: res.status,
        statusText: res.statusText,
        responseBody: sanitizeProviderErrorBody(
          responseText || (error instanceof Error ? error.message : String(error)),
        ),
        elapsedMs: Date.now() - startedAt,
        timedOut,
        aborted: controller.signal.aborted,
        responseTextExists: responseText.trim().length > 0,
        candidateContentExists: false,
        groundingMetadataExists: false,
      });
    }

    const candidate = payload.candidates?.[0];
    const rawSummary = candidate?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
    const metadata = candidate?.groundingMetadata;
    const searchQueries = (metadata?.webSearchQueries ?? [])
      .map((query) => query.trim())
      .filter((query) => query.length > 0);
    const supportTextByChunkIndex = new Map<number, string[]>();
    for (const support of metadata?.groundingSupports ?? []) {
      const supportText = support.segment?.text?.trim() ?? "";
      if (!supportText) continue;
      for (const chunkIndex of support.groundingChunkIndices ?? []) {
        const existing = supportTextByChunkIndex.get(chunkIndex) ?? [];
        existing.push(supportText);
        supportTextByChunkIndex.set(chunkIndex, existing);
      }
    }
    const approvedSources = buildApprovedGroundedSources(
      (metadata?.groundingChunks ?? []).map((chunk, chunkIndex) => ({
        title: chunk.web?.title,
        url: chunk.web?.uri,
        supportText: supportTextByChunkIndex.get(chunkIndex) ?? [],
      })),
    );
    const supportSummary = (metadata?.groundingSupports ?? [])
      .map((support) => support.segment?.text?.trim() ?? "")
      .filter((text) => text.length > 0)
      .join("\n")
      .trim();
    const sourceTitleSummary = approvedSources.map((source) => source.title).join("\n").trim();
    const groundedSummary = rawSummary || supportSummary || sourceTitleSummary;
    if (!groundedSummary) {
      throw new SiteDetailsProviderError({
        code: "GROUNDED_RESPONSE_TEXT_MISSING",
        stage: "GROUNDED_RESEARCH",
        originalModel: params.model,
        normalizedModel,
        endpoint: sanitizedEndpoint,
        status: res.status,
        statusText: res.statusText,
        responseBody: sanitizeProviderErrorBody(responseText),
        elapsedMs: Date.now() - startedAt,
        timedOut,
        aborted: controller.signal.aborted,
        responseTextExists: responseText.trim().length > 0,
        candidateContentExists: false,
        groundingMetadataExists: Boolean(candidate?.groundingMetadata),
      });
    }
    const groundingSourceLinks = approvedSources.map((source) => ({ title: source.title, url: source.url }));
    const groundingMetadataPresent = Boolean(metadata && approvedSources.length > 0);
    if (!groundingMetadataPresent) {
      throw new SiteDetailsProviderError({
        code: "GROUNDING_METADATA_MISSING",
        stage: "GROUNDED_RESEARCH",
        originalModel: params.model,
        normalizedModel,
        endpoint: sanitizedEndpoint,
        status: res.status,
        statusText: res.statusText,
        responseBody: sanitizeProviderErrorBody(responseText),
        elapsedMs: Date.now() - startedAt,
        timedOut,
        aborted: controller.signal.aborted,
        responseTextExists: responseText.trim().length > 0,
        candidateContentExists: true,
        groundingMetadataExists: false,
      });
    }

    return {
      model: normalizedModel,
      originalModel: params.model,
      normalizedModel,
      endpoint: sanitizedEndpoint,
      elapsedMs: Date.now() - startedAt,
      groundingToolEnabled: true,
      groundingMetadataPresent,
      groundingSearchQueries: searchQueries,
      approvedSources,
      groundingSourceLinks,
      groundedSummary,
    };
  } finally {
    clearTimeout(timeout);
  }
}

