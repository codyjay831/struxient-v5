export type SiteDetailsProviderErrorCode =
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NETWORK_ERROR"
  | "PROVIDER_RESPONSE_PARSE_ERROR"
  | "GROUNDING_METADATA_MISSING"
  | "GROUNDED_RESPONSE_TEXT_MISSING"
  | "EXTRACTION_HTTP_ERROR"
  | "EXTRACTION_PARSE_ERROR";

export type SiteDetailsProviderErrorStage = "GROUNDED_RESEARCH" | "EXTRACTION";

export type SiteDetailsProviderErrorDetails = {
  code: SiteDetailsProviderErrorCode;
  stage: SiteDetailsProviderErrorStage;
  originalModel: string;
  normalizedModel: string;
  endpoint: string;
  status?: number;
  statusText?: string;
  responseBody?: string;
  elapsedMs: number;
  timedOut: boolean;
  aborted: boolean;
  responseTextExists: boolean;
  candidateContentExists: boolean;
  groundingMetadataExists: boolean;
};

export class SiteDetailsProviderError extends Error {
  readonly details: SiteDetailsProviderErrorDetails;

  constructor(details: SiteDetailsProviderErrorDetails) {
    super(formatSiteDetailsProviderErrorMessage(details));
    this.name = "SiteDetailsProviderError";
    this.details = details;
  }
}

export {
  buildGeminiGenerateContentEndpoint,
  normalizeGeminiModelId,
} from "@/lib/ai/gemini-generate-content";

export function sanitizeProviderErrorBody(text: string, maxChars = 2_000): string {
  if (!text) return "";
  const normalized = text
    .replace(/AIza[0-9A-Za-z\-_]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…[truncated]`;
}

export function isSiteDetailsProviderError(error: unknown): error is SiteDetailsProviderError {
  return error instanceof SiteDetailsProviderError;
}

export function formatSiteDetailsProviderErrorMessage(details: SiteDetailsProviderErrorDetails): string {
  return JSON.stringify(details);
}
