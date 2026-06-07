import type { ScopeFact } from "@/lib/scope-facts/scope-facts";
import type { DerivedNeed } from "@/lib/derived-needs/types";

const ROOFING_SET_KEY = "roofing.replacement";

function getNumberFact(
  facts: readonly ScopeFact[],
  questionKey: string,
): number | null {
  const fact = facts.find((item) => item.questionKey === questionKey);
  if (!fact || fact.value.kind !== "number") return null;
  return Number.isFinite(fact.value.value) ? fact.value.value : null;
}

function getYesNoChoice(
  facts: readonly ScopeFact[],
  questionKey: string,
): "yes" | "no" | "unknown" | null {
  const fact = facts.find((item) => item.questionKey === questionKey);
  if (!fact) return null;
  if (fact.value.kind === "unknown") return "unknown";
  if (fact.value.kind !== "choice") return null;
  if (fact.value.optionKeys.includes("yes")) return "yes";
  if (fact.value.optionKeys.includes("no")) return "no";
  return null;
}

function ceil(value: number): number {
  return Math.ceil(Number.isFinite(value) ? value : 0);
}

export function deriveRoofingNeedsFromFacts(
  facts: readonly ScopeFact[],
  sourceOverride?: { quoteLineItemId: string; questionSetKey: string; questionSetVersion: number },
): DerivedNeed[] {
  const hasRoofingFacts = facts.some((fact) => fact.source.questionSetKey === ROOFING_SET_KEY);
  if (!hasRoofingFacts && !sourceOverride) {
    return [];
  }

  const source =
    sourceOverride ??
    facts.find((fact) => fact.source.questionSetKey === ROOFING_SET_KEY)?.source;
  if (!source) return [];

  const needs: DerivedNeed[] = [];
  const squares = getNumberFact(facts, "roofing.replacement.squares");
  const wastePercent = getNumberFact(facts, "roofing.replacement.waste_percent");
  const wasteFactor = (wastePercent ?? 10) / 100;

  if (squares != null) {
    const shingleBundles = ceil(squares * 3 * (1 + wasteFactor));
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "material",
      name: "Shingle bundles",
      unit: "bundle",
      quantity: shingleBundles,
      confidence: wastePercent == null ? "estimated" : "known",
      orderNote:
        wastePercent == null
          ? "Waste factor missing; used 10% estimate."
          : undefined,
    });
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "material",
      name: "Underlayment coverage",
      unit: "sq",
      quantity: ceil(squares * (1 + wasteFactor)),
      confidence: wastePercent == null ? "estimated" : "known",
      orderNote:
        wastePercent == null
          ? "Waste factor missing; used 10% estimate."
          : undefined,
    });
  } else {
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "review_warning",
      name: "Missing roof squares",
      unit: "item",
      quantity: 1,
      confidence: "needs_review",
      orderNote: "Enter roof squares to derive bundles and underlayment.",
    });
  }

  const directMappings: Array<{ key: string; name: string; unit: string; category?: "material" | "equipment" }> = [
    { key: "roofing.replacement.sheathing_sheets", name: "Sheathing panels", unit: "sheet" },
    { key: "roofing.replacement.ridge_vent_lf", name: "Ridge vent", unit: "lf" },
    { key: "roofing.replacement.box_vents_count", name: "Box vents", unit: "count" },
    { key: "roofing.replacement.pipe_boots_count", name: "Pipe boots", unit: "count" },
    { key: "roofing.replacement.drip_edge_lf", name: "Drip edge", unit: "lf" },
  ];

  for (const mapping of directMappings) {
    const quantity = getNumberFact(facts, mapping.key);
    if (quantity == null) continue;
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: mapping.category ?? "material",
      name: mapping.name,
      unit: mapping.unit,
      quantity,
      confidence: "known",
    });
  }

  const dumpsterRequired = getYesNoChoice(
    facts,
    "roofing.replacement.dumpster_required",
  );
  if (dumpsterRequired === "yes") {
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "equipment",
      name: "Dumpster rental",
      unit: "rental",
      quantity: 1,
      confidence: "known",
    });
  } else if (dumpsterRequired === "unknown") {
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "review_warning",
      name: "Dumpster requirement unknown",
      unit: "item",
      quantity: 1,
      confidence: "needs_review",
    });
  }

  const iceWaterShield = getYesNoChoice(
    facts,
    "roofing.replacement.ice_water_shield_required",
  );
  if (iceWaterShield === "yes" && squares != null) {
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "material",
      name: "Ice & water shield",
      unit: "sq",
      quantity: ceil(squares * 0.25),
      confidence: "estimated",
      orderNote: "Estimated at 25% roof coverage unless specified.",
    });
  } else if (iceWaterShield === "unknown") {
    needs.push({
      sourceQuoteLineItemId: source.quoteLineItemId,
      sourceQuestionSetKey: source.questionSetKey,
      category: "review_warning",
      name: "Ice & water shield requirement unknown",
      unit: "item",
      quantity: 1,
      confidence: "needs_review",
    });
  }

  return needs;
}
