import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_INVALID_EXECUTION_PLAN_MESSAGE } from "./ai-execution-plan-generation";
import {
  AI_TEMPORARILY_UNAVAILABLE_MESSAGE,
  AiExecutionPlanInvalidError,
  AiProviderTemporarilyUnavailableError,
  getAiActionErrorMessage,
  isAiProviderTemporarilyUnavailable,
} from "./ai-provider-errors";

test("isAiProviderTemporarilyUnavailable detects HTTP 503 status", () => {
  const err = Object.assign(new Error("upstream failure"), { status: 503 });
  assert.equal(isAiProviderTemporarilyUnavailable(err), true);
});

test("isAiProviderTemporarilyUnavailable detects high demand message", () => {
  const err = new Error(
    "[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent: [503 Service Unavailable] The model is experiencing high demand. Please try again later.",
  );
  assert.equal(isAiProviderTemporarilyUnavailable(err), true);
});

test("isAiProviderTemporarilyUnavailable detects rate limit", () => {
  const err = Object.assign(new Error("Rate limit exceeded"), { status: 429 });
  assert.equal(isAiProviderTemporarilyUnavailable(err), true);
});

test("isAiProviderTemporarilyUnavailable ignores auth errors", () => {
  const err = Object.assign(new Error("API key not valid"), { status: 401 });
  assert.equal(isAiProviderTemporarilyUnavailable(err), false);
});

test("getAiActionErrorMessage returns safe copy without provider URL", () => {
  const err = new Error(
    "Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini: [503 Service Unavailable] overloaded",
  );
  const message = getAiActionErrorMessage(err);
  assert.equal(message, AI_TEMPORARILY_UNAVAILABLE_MESSAGE);
  assert.equal(message.includes("googleapis.com"), false);
});

test("getAiActionErrorMessage uses fallback for non-temporary errors", () => {
  const err = new Error("Unexpected parse failure");
  assert.equal(getAiActionErrorMessage(err, "Custom fallback."), "Custom fallback.");
});

test("AiProviderTemporarilyUnavailableError is detected", () => {
  const err = new AiProviderTemporarilyUnavailableError();
  assert.equal(isAiProviderTemporarilyUnavailable(err), true);
  assert.equal(getAiActionErrorMessage(err), AI_TEMPORARILY_UNAVAILABLE_MESSAGE);
});

test("AiExecutionPlanInvalidError returns user-safe invalid plan copy", () => {
  const err = new AiExecutionPlanInvalidError();
  assert.equal(getAiActionErrorMessage(err), AI_INVALID_EXECUTION_PLAN_MESSAGE);
});
