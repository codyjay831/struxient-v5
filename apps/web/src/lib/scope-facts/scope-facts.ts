import { formatAnswerValue } from "@/lib/clarification/clarification-answers";
import type { ClarificationAnswer, LineClarificationAnswers } from "@/lib/clarification/clarification-types";

export type ScopeFactConfidence = "known" | "estimated" | "needs_review";

export type ScopeFactSource = {
  quoteLineItemId: string;
  questionSetKey: string;
  questionSetVersion: number;
};

export type ScopeFact = {
  source: ScopeFactSource;
  questionKey: string;
  questionLabel: string;
  inputType: ClarificationAnswer["inputType"];
  unit: string | null;
  customerFacing: boolean;
  confidence: ScopeFactConfidence;
  value: ClarificationAnswer["value"];
  displayValue: string;
};

function deriveConfidence(answer: ClarificationAnswer): ScopeFactConfidence {
  if (answer.value.kind === "unknown") return "needs_review";
  if (
    answer.value.kind === "choice" &&
    answer.value.optionKeys.includes("__other__")
  ) {
    return "estimated";
  }
  return "known";
}

function deriveUnit(answer: ClarificationAnswer): string | null {
  if (answer.value.kind === "number") {
    const normalized = answer.value.unit?.trim();
    return normalized ? normalized : null;
  }
  return null;
}

/**
 * Canonical adapter: clarification answers become normalized scope facts.
 * This is the single conversion surface that downstream derivation should read.
 */
export function toScopeFactsFromLineClarifications(
  quoteLineItemId: string,
  clarifications: readonly LineClarificationAnswers[],
): ScopeFact[] {
  const facts: ScopeFact[] = [];
  for (const clarification of clarifications) {
    for (const answer of clarification.answers) {
      facts.push({
        source: {
          quoteLineItemId,
          questionSetKey: clarification.questionSetKey,
          questionSetVersion: clarification.questionSetVersion,
        },
        questionKey: answer.questionKey,
        questionLabel: answer.questionLabelSnapshot,
        inputType: answer.inputType,
        unit: deriveUnit(answer),
        customerFacing: Boolean(answer.customerFacing),
        confidence: deriveConfidence(answer),
        value: answer.value,
        displayValue: formatAnswerValue(answer),
      });
    }
  }
  return facts;
}
