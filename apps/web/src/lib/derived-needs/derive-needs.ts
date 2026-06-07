import type { LineClarificationAnswers } from "@/lib/clarification/clarification-types";
import { toScopeFactsFromLineClarifications } from "@/lib/scope-facts/scope-facts";
import { deriveRoofingNeedsFromFacts } from "@/lib/derived-needs/trades/roofing";
import type { DerivedNeed } from "@/lib/derived-needs/types";

export type DeriveNeedsInputLine = {
  lineId: string;
  clarifications: readonly LineClarificationAnswers[];
};

/**
 * Derives operational needs from saved scope facts.
 * Enter once, derive everywhere: every downstream need should come from here.
 */
export function deriveNeedsForQuoteLines(
  lines: readonly DeriveNeedsInputLine[],
): DerivedNeed[] {
  const derived: DerivedNeed[] = [];
  for (const line of lines) {
    const facts = toScopeFactsFromLineClarifications(line.lineId, line.clarifications);
    const roofingClarification = line.clarifications.find(
      (clarification) => clarification.questionSetKey === "roofing.replacement",
    );
    derived.push(
      ...deriveRoofingNeedsFromFacts(
        facts,
        roofingClarification
          ? {
              quoteLineItemId: line.lineId,
              questionSetKey: roofingClarification.questionSetKey,
              questionSetVersion: roofingClarification.questionSetVersion,
            }
          : undefined,
      ),
    );
  }
  return derived;
}
