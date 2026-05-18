/**
 * User-safe handling for transient Gemini / Google AI provider failures.
 */

import { AI_INVALID_EXECUTION_PLAN_MESSAGE } from "./ai-execution-plan-generation";

export const AI_TEMPORARILY_UNAVAILABLE_MESSAGE =
  "AI is temporarily unavailable. Try again in a few minutes. No changes were saved.";

export class AiProviderTemporarilyUnavailableError extends Error {
  constructor(message: string = AI_TEMPORARILY_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = "AiProviderTemporarilyUnavailableError";
  }
}

export class AiExecutionPlanInvalidError extends Error {
  constructor(message: string = AI_INVALID_EXECUTION_PLAN_MESSAGE) {
    super(message);
    this.name = "AiExecutionPlanInvalidError";
  }
}

function collectErrorText(error: unknown): string {
  if (error == null) return "";

  const parts: string[] = [];

  if (error instanceof Error) {
    parts.push(error.message);
    if ("cause" in error && error.cause != null) {
      parts.push(collectErrorText(error.cause));
    }
  } else if (typeof error === "string") {
    parts.push(error);
  } else if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") parts.push(record.message);
    if (typeof record.statusText === "string") parts.push(record.statusText);
    if (typeof record.code === "string") parts.push(record.code);
  }

  return parts.join(" ").toLowerCase();
}

function getHttpStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== "object") return undefined;

  const record = error as Record<string, unknown>;
  const status = record.status;
  if (typeof status === "number") return status;

  if (typeof status === "string" && /^\d{3}$/.test(status)) {
    return Number(status);
  }

  if ("cause" in record && record.cause != null) {
    return getHttpStatus(record.cause);
  }

  return undefined;
}

const TEMPORARY_UNAVAILABLE_MESSAGE_PATTERNS = [
  "service unavailable",
  "high demand",
  "model is overloaded",
  "overloaded",
  "temporarily unavailable",
  "try again later",
  "resource exhausted",
  "resource_exhausted",
  "rate limit",
  "rate_limit",
  "too many requests",
  "quota exceeded",
  "backend error",
  "unavailable",
] as const;

/**
 * True when the provider is overloaded or otherwise temporarily unavailable.
 * Used after retry exhaustion to avoid surfacing raw SDK errors or saving fallbacks.
 */
export function isAiProviderTemporarilyUnavailable(error: unknown): boolean {
  if (error instanceof AiProviderTemporarilyUnavailableError) {
    return true;
  }

  const status = getHttpStatus(error);
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  if (typeof status === "number" && status >= 500 && status < 600) {
    return true;
  }

  const text = collectErrorText(error);
  if (!text) return false;

  if (/\b503\b/.test(text) || /\b502\b/.test(text) || /\b504\b/.test(text) || /\b429\b/.test(text)) {
    return true;
  }

  return TEMPORARY_UNAVAILABLE_MESSAGE_PATTERNS.some((pattern) => text.includes(pattern));
}

/** Maps thrown AI errors to a short message safe to show in the UI. */
export function getAiActionErrorMessage(
  error: unknown,
  fallback = "Failed to generate AI execution plan.",
): string {
  if (error instanceof AiExecutionPlanInvalidError) {
    return error.message;
  }

  if (isAiProviderTemporarilyUnavailable(error)) {
    return AI_TEMPORARILY_UNAVAILABLE_MESSAGE;
  }

  if (error instanceof AiProviderTemporarilyUnavailableError) {
    return error.message;
  }

  return fallback;
}
