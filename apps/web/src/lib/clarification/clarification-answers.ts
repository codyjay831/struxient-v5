/**
 * Scope Clarification — pure answer helpers.
 *
 * Validation, version-safe answer construction, and rendering answers into
 * customer-facing and internal scope text. No DB, no React, no execution-task
 * mutation. Safe to unit test and to import from client or server.
 */

import type {
  ClarificationAnswer,
  ClarificationAnswerValue,
  ClarificationQuestion,
  ClarificationQuestionSet,
  LineClarificationAnswers,
} from "./clarification-types";

/** Rehydrates saved line answers into panel state keyed by question key. */
export function lineClarificationAnswersToAnswerMap(
  saved: LineClarificationAnswers,
): Record<string, ClarificationAnswerValue> {
  const map: Record<string, ClarificationAnswerValue> = {};
  for (const answer of saved.answers) {
    map[answer.questionKey] = answer.value;
  }
  return map;
}

export const NEEDS_FIELD_VERIFY_LABEL = "Needs field verify";

export type AnswerValidationResult = { ok: true } | { ok: false; error: string };

/** True when an answer carries a usable, non-empty value. */
export function isAnswerProvided(value: ClarificationAnswerValue): boolean {
  switch (value.kind) {
    case "choice":
      return value.optionKeys.length > 0 || Boolean(value.otherText?.trim());
    case "text":
      return value.text.trim().length > 0;
    case "number":
      return Number.isFinite(value.value);
    case "unknown":
      return true;
  }
}

/**
 * Validates an answer value against its question definition.
 * "unknown" is always valid — contractors often do not know yet.
 */
export function validateAnswerValue(
  question: ClarificationQuestion,
  value: ClarificationAnswerValue,
): AnswerValidationResult {
  if (value.kind === "unknown") {
    return { ok: true };
  }

  switch (question.inputType) {
    case "single_choice": {
      if (value.kind !== "choice") {
        return { ok: false, error: `"${question.label}" expects a single choice answer.` };
      }
      if (value.optionKeys.length > 1) {
        return { ok: false, error: `"${question.label}" allows only one selection.` };
      }
      return validateChoiceKeys(question, value);
    }
    case "yes_no_unknown": {
      if (value.kind !== "choice" || value.optionKeys.length > 1) {
        return { ok: false, error: `"${question.label}" expects Yes or No.` };
      }
      const allowed = new Set(["yes", "no"]);
      for (const key of value.optionKeys) {
        if (!allowed.has(key)) {
          return { ok: false, error: `"${question.label}" only accepts Yes, No, or Unknown.` };
        }
      }
      return { ok: true };
    }
    case "multi_choice": {
      if (value.kind !== "choice") {
        return { ok: false, error: `"${question.label}" expects one or more choices.` };
      }
      return validateChoiceKeys(question, value);
    }
    case "short_text": {
      if (value.kind !== "text") {
        return { ok: false, error: `"${question.label}" expects a short text answer.` };
      }
      if (value.text.length > 500) {
        return { ok: false, error: `"${question.label}" answer is too long (max 500 characters).` };
      }
      return { ok: true };
    }
    case "notes": {
      if (value.kind !== "text") {
        return { ok: false, error: `"${question.label}" expects a note.` };
      }
      if (value.text.length > 2000) {
        return { ok: false, error: `"${question.label}" note is too long (max 2000 characters).` };
      }
      return { ok: true };
    }
    case "number": {
      if (value.kind !== "number") {
        return { ok: false, error: `"${question.label}" expects a number.` };
      }
      if (!Number.isFinite(value.value)) {
        return { ok: false, error: `"${question.label}" must be a valid number.` };
      }
      return { ok: true };
    }
  }
}

function validateChoiceKeys(
  question: ClarificationQuestion,
  value: Extract<ClarificationAnswerValue, { kind: "choice" }>,
): AnswerValidationResult {
  const optionKeys = new Set((question.options ?? []).map((o) => o.key));
  for (const key of value.optionKeys) {
    if (key === "__other__") {
      if (!question.allowOther) {
        return { ok: false, error: `"${question.label}" does not allow a custom value.` };
      }
      continue;
    }
    if (!optionKeys.has(key)) {
      return { ok: false, error: `"${question.label}" got an unknown option "${key}".` };
    }
  }
  if (value.optionKeys.includes("__other__") && !value.otherText?.trim()) {
    return { ok: false, error: `Enter the custom value for "${question.label}".` };
  }
  return { ok: true };
}

/**
 * Builds a version-safe {@link ClarificationAnswer} from a question + value,
 * snapshotting labels so the answer renders correctly even after library edits.
 */
export function buildClarificationAnswer(
  set: Pick<ClarificationQuestionSet, "key" | "version">,
  question: ClarificationQuestion,
  value: ClarificationAnswerValue,
): ClarificationAnswer {
  const optionLabelSnapshots: Record<string, string> = {};
  if (value.kind === "choice") {
    for (const key of value.optionKeys) {
      const option = (question.options ?? []).find((o) => o.key === key);
      if (option) {
        optionLabelSnapshots[key] = option.label;
      }
    }
  }

  return {
    questionSetKey: set.key,
    questionSetVersion: set.version,
    questionKey: question.key,
    questionLabelSnapshot: question.label,
    inputType: question.inputType,
    value,
    optionLabelSnapshots:
      Object.keys(optionLabelSnapshots).length > 0 ? optionLabelSnapshots : undefined,
    customerFacing: question.customerFacing,
  };
}

/** Fallback label for well-known option keys with no snapshot (e.g. yes/no). */
function defaultOptionLabel(key: string): string {
  if (key === "yes") return "Yes";
  if (key === "no") return "No";
  return key;
}

/** Renders the value portion of an answer (no label prefix). */
export function formatAnswerValue(answer: ClarificationAnswer): string {
  const { value } = answer;
  switch (value.kind) {
    case "unknown":
      return NEEDS_FIELD_VERIFY_LABEL;
    case "text":
      return value.text.trim();
    case "number":
      return value.unit ? `${value.value} ${value.unit}` : String(value.value);
    case "choice": {
      const parts = value.optionKeys
        .filter((key) => key !== "__other__")
        .map((key) => answer.optionLabelSnapshots?.[key] ?? defaultOptionLabel(key));
      if (value.optionKeys.includes("__other__") && value.otherText?.trim()) {
        parts.push(value.otherText.trim());
      }
      return parts.join(", ");
    }
  }
}

export type ClarificationScopeText = {
  /** Bullet lines suitable for customer-facing included notes. */
  customerLines: string[];
  /** Bullet lines suitable for internal notes (includes unknowns). */
  internalLines: string[];
};

/**
 * Renders provided answers into customer-facing and internal scope lines.
 *
 * - Customer lines include only customer-facing answers with a real value
 *   (unknown / needs-verify are never shown to customers).
 * - Internal lines include every provided answer, surfacing unknowns as
 *   "Needs field verify" so the office knows what to confirm.
 */
export function renderClarificationAnswersToScopeText(
  answers: readonly ClarificationAnswer[],
): ClarificationScopeText {
  const customerLines: string[] = [];
  const internalLines: string[] = [];

  for (const answer of answers) {
    if (!isAnswerProvided(answer.value)) {
      continue;
    }
    const label = answer.questionLabelSnapshot.trim();
    const formatted = formatAnswerValue(answer);
    if (!label || !formatted) {
      continue;
    }
    const line = `${label}: ${formatted}`;
    internalLines.push(line);
    if (answer.customerFacing && answer.value.kind !== "unknown") {
      customerLines.push(line);
    }
  }

  return { customerLines, internalLines };
}
