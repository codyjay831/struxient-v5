import {
  serializeApprovedGroundedSourcesForPrompt,
  type ApprovedGroundedSource,
} from "@/lib/ai/site-details-approved-sources";
import {
  buildGeminiGenerateContentEndpoint,
  sanitizeProviderErrorBody,
  SiteDetailsProviderError,
} from "@/lib/ai/site-details-provider-error";

export async function extractSiteDetailsFromGroundedResearch(params: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  addressLine: string;
  missingScopes: string[];
  groundedSummary: string;
  approvedSources: ApprovedGroundedSource[];
}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  const startedAt = Date.now();
  let timedOut = false;
  try {
    const { endpoint, sanitizedEndpoint, normalizedModel } = buildGeminiGenerateContentEndpoint({
      apiKey: params.apiKey,
      model: params.model,
    });
    const approvedSourcesJson = serializeApprovedGroundedSourcesForPrompt(params.approvedSources);
    const prompt = `You are extracting contractor site details from grounded research notes.
Address: ${params.addressLine}
Requested scopes: ${params.missingScopes.join(", ")}

Approved grounded sources (reference by source id only):
${approvedSourcesJson}

Grounded research summary:
${params.groundedSummary}

Rules:
- Return JSON only.
- If unknown, use null (or [] for apnEvidence).
- Never return raw source URLs for evidence.
- Use only source IDs listed above.
- Do not invent new source IDs.
- Prefer source IDs whose supportText explicitly backs the claim.
- If electricUtilityCandidate is non-null, coverageSourceId must be non-null and grounded.
- A model claim is not proof. Only include APN evidence if a source explicitly shows APN for the exact address.
- Reject neighboring addresses and mismatched ZIPs for APN evidence.
- Do not use a generic assessor search/landing page as sole APN proof.
- Electric utility means electric distribution/interconnection utility (not water/sewer, not community-choice provider).

Return exact shape:
{
  "electricUtilityCandidate": {
    "name": string,
    "coverageSourceId": string | null,
    "coverageBasis": "ZIP" | "CITY" | "COUNTY" | "ADDRESS" | null,
    "addressMatched": boolean,
    "isElectric": boolean,
    "explanation": string
  } | null,
  "jurisdictionName": string | null,
  "jurisdictionType": "CITY" | "COUNTY" | "UNINCORPORATED_COUNTY" | "DISTRICT" | null,
  "jurisdictionSourceId": string | null,
  "countyAssessorCounty": string | null,
  "countyAssessorState": string | null,
  "countyAssessorSourceId": string | null,
  "apnEvidence": [{
    "value": string,
    "sourceId": string,
    "addressMatched": boolean,
    "apnShownOnSource": boolean,
    "explanation": string
  }],
  "apnCandidate": {
    "value": string,
    "sourceId": string,
    "addressMatched": boolean,
    "apnShownOnSource": boolean,
    "explanation": string
  } | null
}`;

    const requestPayload = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
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
          stage: "EXTRACTION",
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
        stage: "EXTRACTION",
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
        code: "EXTRACTION_HTTP_ERROR",
        stage: "EXTRACTION",
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
    let payload: {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    try {
      payload = JSON.parse(responseText) as typeof payload;
    } catch (error) {
      throw new SiteDetailsProviderError({
        code: "EXTRACTION_PARSE_ERROR",
        stage: "EXTRACTION",
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
    const text =
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
    try {
      const parsed = parseGeminiJsonResponse(text);
      return parsed;
    } catch (error) {
      throw new SiteDetailsProviderError({
        code: "EXTRACTION_PARSE_ERROR",
        stage: "EXTRACTION",
        originalModel: params.model,
        normalizedModel,
        endpoint: sanitizedEndpoint,
        status: res.status,
        statusText: res.statusText,
        responseBody: sanitizeProviderErrorBody(
          text || responseText || (error instanceof Error ? error.message : String(error)),
        ),
        elapsedMs: Date.now() - startedAt,
        timedOut,
        aborted: controller.signal.aborted,
        responseTextExists: responseText.trim().length > 0,
        candidateContentExists: text.length > 0,
        groundingMetadataExists: false,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

function parseGeminiJsonResponse(text: string): unknown {
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
