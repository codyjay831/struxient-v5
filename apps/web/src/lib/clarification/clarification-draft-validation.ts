/**
 * Client-safe validation for inline clarification set drafts.
 * Blocks save on structural issues; warnings are surfaced separately.
 */

export type ClarificationDraftQuestion = {
  key: string;
  label: string;
  inputType: string;
  options?: { key: string; label: string }[];
};

export type ClarificationDraftPayload = {
  key: string;
  label: string;
  questions: ClarificationDraftQuestion[];
};

export type ClarificationDraftValidationIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_");
}

function duplicateKeys(keys: string[]): string[] {
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (!normalized) continue;
    const count = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, count);
    if (count === 2) dupes.push(normalized);
  }
  return dupes;
}

const CHOICE_TYPES = new Set(["single_choice", "multi_choice"]);

/**
 * Validates a clarification set draft before save.
 * Errors block persistence; warnings are informational only.
 */
export function validateClarificationSetDraft(
  input: ClarificationDraftPayload,
  options?: { existingSetKey?: { label: string; latestVersion: number } | null },
): ClarificationDraftValidationIssue[] {
  const issues: ClarificationDraftValidationIssue[] = [];

  const setKey = normalizeKey(input.key);
  if (!input.label.trim()) {
    issues.push({
      severity: "error",
      path: "label",
      message: "Question set label is required.",
    });
  }
  if (!setKey) {
    issues.push({
      severity: "error",
      path: "key",
      message: "Question set key is required.",
    });
  }

  if (input.questions.length === 0) {
    issues.push({
      severity: "error",
      path: "questions",
      message: "Add at least one question.",
    });
  }

  for (const [index, question] of input.questions.entries()) {
    const path = `questions[${index}]`;
    if (!question.label.trim()) {
      issues.push({
        severity: "error",
        path: `${path}.label`,
        message: `Question ${index + 1} needs a label.`,
      });
    }
    if (!normalizeKey(question.key || question.label)) {
      issues.push({
        severity: "error",
        path: `${path}.key`,
        message: `Question ${index + 1} needs a key.`,
      });
    }
    if (
      CHOICE_TYPES.has(question.inputType) &&
      (!question.options || question.options.length === 0)
    ) {
      issues.push({
        severity: "error",
        path: `${path}.options`,
        message: `"${question.label || `Question ${index + 1}`}" needs at least one option.`,
      });
    }
    for (const [optionIndex, option] of (question.options ?? []).entries()) {
      if (!option.label.trim()) {
        issues.push({
          severity: "error",
          path: `${path}.options[${optionIndex}].label`,
          message: `Option ${optionIndex + 1} on question ${index + 1} needs a label.`,
        });
      }
    }
    const optionDupes = duplicateKeys((question.options ?? []).map((o) => o.key || o.label));
    for (const dupe of optionDupes) {
      issues.push({
        severity: "error",
        path: `${path}.options`,
        message: `Duplicate option key "${dupe}" on question ${index + 1}.`,
      });
    }
  }

  const questionDupes = duplicateKeys(
    input.questions.map((question) => question.key || question.label),
  );
  for (const dupe of questionDupes) {
    issues.push({
      severity: "error",
      path: "questions",
      message: `Duplicate question key "${dupe}".`,
    });
  }

  if (setKey && options?.existingSetKey) {
    issues.push({
      severity: "warning",
      path: "key",
      message: `Key "${setKey}" already exists as "${options.existingSetKey.label}" (v${options.existingSetKey.latestVersion}). Saving creates v${options.existingSetKey.latestVersion + 1}.`,
    });
  }

  return issues;
}

export function draftHasBlockingErrors(issues: ClarificationDraftValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
