import type { ScopeSuggestionConfidence } from "./quote-line-items-proposal-schema";

export type LineItemTemplateMatchCandidate = {
  id: string;
  description: string;
  tagNames: string[];
  tagAliases: string[];
  updatedAt?: Date;
};

export type RecommendedTemplateMatch = {
  templateId: string;
  templateDescription: string;
  confidence: ScopeSuggestionConfidence;
  score: number;
  reasoning: string;
};

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "with",
  "is", "are", "was", "were", "be", "this", "that", "from", "by", "as", "it",
]);

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): Set<string> {
  const tokens = normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return overlap / Math.max(a.size, b.size);
}

function confidenceFromScore(score: number): ScopeSuggestionConfidence {
  if (score >= 0.55) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

/**
 * Deterministic template recommendation from scope capture context.
 */
export function recommendLineItemTemplates(
  contextText: string,
  candidates: readonly LineItemTemplateMatchCandidate[],
  options?: { limit?: number; minScore?: number },
): RecommendedTemplateMatch[] {
  const limit = options?.limit ?? 8;
  const minScore = options?.minScore ?? 0.15;
  const contextTokens = tokenize(contextText);
  const contextNormalized = normalizeText(contextText);

  if (contextTokens.size === 0 && !contextNormalized) {
    return [];
  }

  const scored: RecommendedTemplateMatch[] = [];

  for (const candidate of candidates) {
    const descTokens = tokenize(candidate.description);
    const descOverlap = overlapRatio(contextTokens, descTokens);

    const tagTokens = new Set<string>();
    for (const name of candidate.tagNames) {
      for (const token of tokenize(name)) {
        tagTokens.add(token);
      }
    }
    for (const alias of candidate.tagAliases) {
      for (const token of tokenize(alias)) {
        tagTokens.add(token);
      }
    }
    const tagOverlap = overlapRatio(contextTokens, tagTokens);

    const descNormalized = normalizeText(candidate.description);
    const substringBoost =
      descNormalized.length > 3 &&
      (contextNormalized.includes(descNormalized) ||
        descNormalized.includes(contextNormalized))
        ? 0.25
        : 0;

    const recencyBoost =
      candidate.updatedAt &&
      Date.now() - candidate.updatedAt.getTime() < 30 * 24 * 60 * 60 * 1000
        ? 0.05
        : 0;

    const score = Math.min(
      1,
      descOverlap * 0.65 + tagOverlap * 0.25 + substringBoost + recencyBoost,
    );

    if (score < minScore) continue;

    const confidence = confidenceFromScore(score);
    const reasons: string[] = [];
    if (descOverlap >= 0.2) reasons.push("description overlap");
    if (tagOverlap >= 0.2) reasons.push("tag overlap");
    if (substringBoost > 0) reasons.push("scope phrase match");

    scored.push({
      templateId: candidate.id,
      templateDescription: candidate.description,
      confidence,
      score,
      reasoning: reasons.length > 0 ? reasons.join(", ") : "context similarity",
    });
  }

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: RecommendedTemplateMatch[] = [];
  for (const item of scored) {
    if (seen.has(item.templateId)) continue;
    seen.add(item.templateId);
    out.push(item);
    if (out.length >= limit) break;
  }

  return out;
}
