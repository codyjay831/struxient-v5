import type { ClarificationAnswer } from "@/lib/clarification/clarification-types";

export type QuoteGapClosureDecision = {
  id: string;
  quoteLineItemId: string | null;
  title: string;
  detail: string | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
};

type QuoteGapClosureInput = {
  lineId: string;
  questionSetKey: string;
  answers: readonly ClarificationAnswer[];
  decisions: readonly QuoteGapClosureDecision[];
};

const NON_TRUTH_TEXT_SENTINELS = new Set([
  "",
  "unknown",
  "unk",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "tbd",
  "needs field verify",
  "need field verify",
  "field verify",
  "pending",
  "other",
]);

function normalizeClosureText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(confirm|clarify|verify|determine|identify|check|validate|assess)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeClosureText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function tokenOverlapRatio(left: string, right: string): number {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function isTruthBearingFreeText(value: string | null | undefined): boolean {
  const normalized = normalizeClosureText(value ?? "");
  if (!normalized) return false;
  return !NON_TRUTH_TEXT_SENTINELS.has(normalized);
}

/**
 * True when an explicit answer contains usable scope truth.
 * Unknown/empty/sentinel answers are never truth-bearing.
 */
export function isTruthBearingClarificationAnswer(answer: ClarificationAnswer): boolean {
  if (!answer || !answer.value) return false;
  if (answer.value.kind === "unknown") return false;

  if (answer.value.kind === "text") {
    return isTruthBearingFreeText(answer.value.text);
  }

  if (answer.value.kind === "number") {
    return Number.isFinite(answer.value.value);
  }

  if (answer.value.kind === "choice") {
    if (!Array.isArray(answer.value.optionKeys) || answer.value.optionKeys.length === 0) {
      return false;
    }

    const hasTruthBearingOption = answer.value.optionKeys.some((optionKey) =>
      isTruthBearingFreeText(optionKey),
    );
    const hasTruthBearingOther = isTruthBearingFreeText(answer.value.otherText);
    return hasTruthBearingOption || hasTruthBearingOther;
  }

  return false;
}

function answerTextCandidates(answer: ClarificationAnswer): string[] {
  const candidates: string[] = [];
  if (answer.value.kind === "text") {
    candidates.push(answer.value.text);
  } else if (answer.value.kind === "number") {
    candidates.push(
      answer.value.unit ? `${answer.value.value} ${answer.value.unit}` : String(answer.value.value),
    );
  } else if (answer.value.kind === "choice") {
    for (const optionKey of answer.value.optionKeys) {
      const snapshot = answer.optionLabelSnapshots?.[optionKey];
      if (snapshot) candidates.push(snapshot);
      candidates.push(optionKey);
    }
    if (answer.value.otherText?.trim()) {
      candidates.push(answer.value.otherText);
    }
  }
  return candidates
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function decisionTextCandidates(decision: QuoteGapClosureDecision): string[] {
  const candidates = [decision.title];
  if (decision.detail?.trim()) candidates.push(decision.detail);
  return candidates;
}

function hasStableReferenceMatch(
  decision: QuoteGapClosureDecision,
  questionSetKey: string,
  answer: ClarificationAnswer,
): boolean {
  const sourceRefType = decision.sourceRefType?.toLowerCase() ?? "";
  const sourceRefId = decision.sourceRefId?.trim() ?? "";
  if (!sourceRefType || !sourceRefId) return false;
  if (!sourceRefType.includes("clarification") && !sourceRefType.includes("question")) return false;
  return (
    sourceRefId === answer.questionKey ||
    sourceRefId === `${questionSetKey}:${answer.questionKey}` ||
    sourceRefId === `${questionSetKey}.${answer.questionKey}`
  );
}

function hasConservativeTextMatch(
  decision: QuoteGapClosureDecision,
  answer: ClarificationAnswer,
): boolean {
  const decisionTexts = decisionTextCandidates(decision);
  const answerTexts = answerTextCandidates(answer);

  for (const decisionText of decisionTexts) {
    const normalizedDecision = normalizeClosureText(decisionText);
    if (normalizedDecision.length < 8) continue;
    for (const answerText of answerTexts) {
      const normalizedAnswer = normalizeClosureText(answerText);
      if (normalizedAnswer.length < 8) continue;
      if (normalizedDecision === normalizedAnswer) {
        return true;
      }
      const ratio = tokenOverlapRatio(normalizedDecision, normalizedAnswer);
      if (ratio >= 0.85) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Conservative matching for closing scope-gap rows when Clarify answers are applied.
 *
 * Rules:
 * - Same-line OPEN gaps: stable-id match OR high-confidence text match.
 * - Quote-wide OPEN gaps: stable-id match only.
 */
export function findScopeDecisionIdsToCloseFromClarification(
  input: QuoteGapClosureInput,
): string[] {
  const matched = new Set<string>();
  for (const decision of input.decisions) {
    for (const answer of input.answers) {
      if (!isTruthBearingClarificationAnswer(answer)) {
        continue;
      }
      const stableMatch = hasStableReferenceMatch(decision, input.questionSetKey, answer);
      if (stableMatch) {
        matched.add(decision.id);
        break;
      }
      if (decision.quoteLineItemId === input.lineId && hasConservativeTextMatch(decision, answer)) {
        matched.add(decision.id);
        break;
      }
    }
  }
  return [...matched];
}
