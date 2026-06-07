/**
 * Scope Clarification — library matching, validation, and dedupe.
 *
 * Pure helpers that decide which canonical question set applies to a line, map
 * messy user vocabulary onto canonical sets via aliases, and detect library
 * health problems (duplicate keys, alias collisions, likely-duplicate sets).
 *
 * No DB, no React. Trade knowledge lives in library data, not in this code.
 */

import type {
  ClarificationBinding,
  ClarificationQuestionSet,
} from "./clarification-types";

export function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "of", "in", "on", "at", "with",
  "is", "are", "be", "this", "that", "from", "by", "as", "it", "new", "existing",
]);

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeForMatch(value)
      .split(" ")
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function phraseMatches(haystack: string, phrase: string): boolean {
  const normalizedHaystack = ` ${normalizeForMatch(haystack)} `;
  const normalizedPhrase = normalizeForMatch(phrase);
  if (!normalizedPhrase) return false;
  return normalizedHaystack.includes(` ${normalizedPhrase} `);
}

export type ClarificationMatchConfidence = "high" | "medium" | "low";

export type ClarificationSetMatch = {
  questionSetKey: string;
  label: string;
  confidence: ClarificationMatchConfidence;
  score: number;
  reasons: string[];
};

export type LineMatchContext = {
  description: string;
  /** Canonical tag/classification keys on the line or its source template. */
  tagKeys?: readonly string[];
  /** Optional extra free text (internal/customer notes) to scan for aliases. */
  extraText?: string;
};

function confidenceFromScore(score: number): ClarificationMatchConfidence {
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

/**
 * Scores active question sets against a line. Bindings tie sets to tag keys and
 * keywords; set aliases catch free-vocabulary phrases in the description.
 */
export function matchQuestionSetsForLine(
  context: LineMatchContext,
  sets: readonly ClarificationQuestionSet[],
  bindings: readonly ClarificationBinding[],
  options?: { limit?: number; minScore?: number },
): ClarificationSetMatch[] {
  const limit = options?.limit ?? 6;
  const minScore = options?.minScore ?? 0.15;

  const haystack = `${context.description} ${context.extraText ?? ""}`;
  const haystackTokens = tokenize(haystack);
  const tagKeySet = new Set((context.tagKeys ?? []).map((key) => key.trim().toLowerCase()));

  const bindingsBySet = new Map<string, ClarificationBinding[]>();
  for (const binding of bindings) {
    const list = bindingsBySet.get(binding.questionSetKey) ?? [];
    list.push(binding);
    bindingsBySet.set(binding.questionSetKey, list);
  }

  const matches: ClarificationSetMatch[] = [];

  for (const set of sets) {
    if (set.status !== "active") continue;

    const reasons: string[] = [];
    let score = 0;

    // Tag / classification binding (strongest signal).
    const setBindings = bindingsBySet.get(set.key) ?? [];
    for (const binding of setBindings) {
      const tagHit = (binding.tagKeys ?? []).some((key) =>
        tagKeySet.has(key.trim().toLowerCase()),
      );
      if (tagHit) {
        score += 0.6;
        reasons.push("tag match");
        break;
      }
    }

    // Alias phrase match against the description / extra text.
    const aliasHit = set.aliases.some((alias) => phraseMatches(haystack, alias));
    if (aliasHit) {
      score += 0.45;
      reasons.push("vocabulary match");
    }

    // Keyword binding fallback.
    for (const binding of setBindings) {
      const keywordHit = (binding.keywords ?? []).some((kw) => phraseMatches(haystack, kw));
      if (keywordHit) {
        score += 0.3;
        reasons.push("keyword match");
        break;
      }
    }

    // Token overlap with the set label as a weak tie-breaker.
    const labelTokens = tokenize(set.label);
    let overlap = 0;
    for (const token of labelTokens) {
      if (haystackTokens.has(token)) overlap += 1;
    }
    if (labelTokens.size > 0) {
      const ratio = overlap / labelTokens.size;
      if (ratio > 0) {
        score += ratio * 0.2;
        if (ratio >= 0.5) reasons.push("label similarity");
      }
    }

    score = Math.min(1, score);
    if (score < minScore) continue;

    matches.push({
      questionSetKey: set.key,
      label: set.label,
      confidence: confidenceFromScore(score),
      score,
      reasons: reasons.length > 0 ? [...new Set(reasons)] : ["context similarity"],
    });
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, limit);
}

/**
 * Maps a single raw user phrase onto a canonical active set, following merge
 * redirects. Used by AI assist + manual "what is this?" lookups so different
 * names for the same thing resolve to one canonical set.
 */
export function resolveActiveSetByAlias(
  phrase: string,
  sets: readonly ClarificationQuestionSet[],
): ClarificationQuestionSet | null {
  const byKey = new Map(sets.map((set) => [set.key, set]));

  const follow = (set: ClarificationQuestionSet): ClarificationQuestionSet | null => {
    let current: ClarificationQuestionSet | undefined = set;
    const seen = new Set<string>();
    while (current && current.status === "merged" && current.mergedIntoKey) {
      if (seen.has(current.key)) return null;
      seen.add(current.key);
      current = byKey.get(current.mergedIntoKey);
    }
    return current && current.status === "active" ? current : null;
  };

  for (const set of sets) {
    if (phraseMatches(phrase, set.label) || set.aliases.some((a) => phraseMatches(phrase, a))) {
      const resolved = follow(set);
      if (resolved) return resolved;
    }
  }
  return null;
}

/* ── Library health / governance ───────────────────────────────────────── */

export type ClarificationLibraryIssue = {
  severity: "error" | "warning";
  code:
    | "DUPLICATE_SET_KEY"
    | "DUPLICATE_QUESTION_KEY"
    | "DUPLICATE_OPTION_KEY"
    | "MERGED_TARGET_MISSING"
    | "ALIAS_COLLISION"
    | "CHOICE_WITHOUT_OPTIONS";
  message: string;
};

/**
 * Validates structural health of a clarification library. Errors block use;
 * warnings (e.g. alias collisions) are dedupe candidates for admin review.
 */
export function validateClarificationLibrary(
  sets: readonly ClarificationQuestionSet[],
): ClarificationLibraryIssue[] {
  const issues: ClarificationLibraryIssue[] = [];
  const seenSetKeys = new Set<string>();
  const setKeys = new Set(sets.map((s) => s.key));

  for (const set of sets) {
    if (seenSetKeys.has(set.key)) {
      issues.push({
        severity: "error",
        code: "DUPLICATE_SET_KEY",
        message: `Duplicate question set key "${set.key}".`,
      });
    }
    seenSetKeys.add(set.key);

    if (set.status === "merged" && (!set.mergedIntoKey || !setKeys.has(set.mergedIntoKey))) {
      issues.push({
        severity: "error",
        code: "MERGED_TARGET_MISSING",
        message: `Merged set "${set.key}" points at a missing target "${set.mergedIntoKey ?? ""}".`,
      });
    }

    const seenQuestionKeys = new Set<string>();
    for (const question of set.questions) {
      if (seenQuestionKeys.has(question.key)) {
        issues.push({
          severity: "error",
          code: "DUPLICATE_QUESTION_KEY",
          message: `Duplicate question key "${question.key}" in set "${set.key}".`,
        });
      }
      seenQuestionKeys.add(question.key);

      const isChoice =
        question.inputType === "single_choice" || question.inputType === "multi_choice";
      if (isChoice && (!question.options || question.options.length === 0)) {
        issues.push({
          severity: "error",
          code: "CHOICE_WITHOUT_OPTIONS",
          message: `Choice question "${question.key}" in set "${set.key}" has no options.`,
        });
      }

      const seenOptionKeys = new Set<string>();
      for (const option of question.options ?? []) {
        if (seenOptionKeys.has(option.key)) {
          issues.push({
            severity: "error",
            code: "DUPLICATE_OPTION_KEY",
            message: `Duplicate option key "${option.key}" in question "${question.key}".`,
          });
        }
        seenOptionKeys.add(option.key);
      }
    }
  }

  // Alias collisions across active sets → likely duplicates.
  const aliasOwners = new Map<string, string[]>();
  for (const set of sets) {
    if (set.status !== "active") continue;
    for (const alias of set.aliases) {
      const key = normalizeForMatch(alias);
      if (!key) continue;
      const owners = aliasOwners.get(key) ?? [];
      owners.push(set.key);
      aliasOwners.set(key, owners);
    }
  }
  for (const [alias, owners] of aliasOwners) {
    if (owners.length > 1) {
      issues.push({
        severity: "warning",
        code: "ALIAS_COLLISION",
        message: `Alias "${alias}" maps to multiple active sets: ${owners.join(", ")}.`,
      });
    }
  }

  return issues;
}

/**
 * Suggests likely-duplicate set pairs (shared aliases or near-identical labels)
 * so admins can merge instead of letting the library sprawl.
 */
export function findDuplicateSetCandidates(
  sets: readonly ClarificationQuestionSet[],
): { aKey: string; bKey: string; reason: string }[] {
  const active = sets.filter((s) => s.status === "active");
  const out: { aKey: string; bKey: string; reason: string }[] = [];

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];

      const aAliases = new Set(a.aliases.map(normalizeForMatch));
      const sharedAlias = b.aliases
        .map(normalizeForMatch)
        .find((alias) => aAliases.has(alias));
      if (sharedAlias) {
        out.push({ aKey: a.key, bKey: b.key, reason: `shared alias "${sharedAlias}"` });
        continue;
      }

      if (normalizeForMatch(a.label) === normalizeForMatch(b.label)) {
        out.push({ aKey: a.key, bKey: b.key, reason: "identical label" });
      }
    }
  }

  return out;
}
