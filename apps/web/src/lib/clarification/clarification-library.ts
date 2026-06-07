/**
 * Scope Clarification — seed library (data-driven, not hardcoded UI logic).
 *
 * This is SEED / system-default content. It is intentionally plain data so it
 * can later move to org-scoped, admin-managed, DB-backed records without
 * changing the rendering or matching code. Trade knowledge lives here as data,
 * never as branching logic inside components or server actions.
 *
 * Canonical keys use a `<trade>.<concept>` / `<trade>.<concept>.<field>` shape
 * and must stay stable. Labels and aliases can evolve freely.
 */

import type {
  ClarificationBinding,
  ClarificationQuestion,
  ClarificationQuestionSet,
} from "./clarification-types";
import {
  matchQuestionSetsForLine,
  resolveActiveSetByAlias,
  type ClarificationSetMatch,
  type LineMatchContext,
} from "./clarification-matching";

const AMPERAGE_OPTIONS = [
  { key: "100a", label: "100A" },
  { key: "125a", label: "125A" },
  { key: "200a", label: "200A" },
  { key: "320a", label: "320A" },
  { key: "400a", label: "400A" },
];

const serviceUpgradeQuestions: ClarificationQuestion[] = [
  {
    key: "electrical.service.new_service_size",
    label: "New service size",
    inputType: "single_choice",
    customerFacing: true,
    allowOther: true,
    options: AMPERAGE_OPTIONS,
    aliases: ["amp upgrade", "service amperage", "new amp size", "panel size"],
  },
  {
    key: "electrical.service.existing_service_size",
    label: "Existing service size",
    inputType: "single_choice",
    customerFacing: false,
    allowOther: true,
    options: AMPERAGE_OPTIONS,
    aliases: ["current amperage", "old panel size"],
  },
  {
    key: "electrical.service.service_feed",
    label: "Service feed",
    inputType: "single_choice",
    customerFacing: true,
    options: [
      { key: "overhead", label: "Overhead", aliases: ["weatherhead", "mast"] },
      { key: "underground", label: "Underground", aliases: ["ug", "lateral"] },
    ],
    aliases: ["feed type", "overhead or underground"],
  },
  {
    key: "electrical.service.trenching_required",
    label: "Trenching required",
    inputType: "yes_no_unknown",
    customerFacing: true,
    aliases: ["trench", "dig"],
  },
  {
    key: "electrical.service.meter_relocation",
    label: "Meter relocation",
    inputType: "yes_no_unknown",
    customerFacing: true,
    aliases: ["move meter", "relocate meter"],
  },
  {
    key: "electrical.service.feeder_strategy",
    label: "Feeder strategy",
    inputType: "single_choice",
    customerFacing: false,
    options: [
      { key: "reuse_existing", label: "Reuse existing" },
      { key: "replace_feeder", label: "Replace feeder" },
      { key: "relocate", label: "Relocate" },
    ],
    aliases: ["feeder", "wire feeder"],
  },
  {
    key: "electrical.service.utility_coordination",
    label: "Utility coordination needed",
    inputType: "yes_no_unknown",
    customerFacing: false,
    aliases: ["utility", "poco", "power company"],
  },
  {
    key: "electrical.service.permit_required",
    label: "Permit required",
    inputType: "yes_no_unknown",
    customerFacing: false,
    aliases: ["permit", "ahj"],
  },
  {
    key: "electrical.service.notes",
    label: "Other service notes",
    inputType: "notes",
    customerFacing: false,
  },
];

/**
 * System seed question sets. Status governance (draft/active/archived/merged)
 * is modeled here so the same lifecycle works once these become DB records.
 */
export const SEED_CLARIFICATION_QUESTION_SETS: ClarificationQuestionSet[] = [
  {
    key: "electrical.service_upgrade",
    version: 1,
    label: "Electrical service upgrade",
    status: "active",
    description:
      "Service / panel upgrade clarifications: size, feed, trenching, utility, permit.",
    aliases: [
      "service upgrade",
      "panel upgrade",
      "main service upgrade",
      "meter main upgrade",
      "msp",
      "service change",
      "200a upgrade",
      "200 amp upgrade",
      "underground service",
    ],
    questions: serviceUpgradeQuestions,
  },
];

/**
 * Seed bindings. Tag keys are the strongest match signal; keywords are a
 * description fallback. Both are data, editable without code changes.
 */
export const SEED_CLARIFICATION_BINDINGS: ClarificationBinding[] = [
  {
    questionSetKey: "electrical.service_upgrade",
    tagKeys: ["service-upgrade", "electrical-service", "panel-upgrade"],
    keywords: ["service upgrade", "panel upgrade", "service change", "msp", "meter main"],
  },
];

/* ── Accessors (registry / loader surface) ─────────────────────────────── */

export function getSeedQuestionSets(): ClarificationQuestionSet[] {
  return SEED_CLARIFICATION_QUESTION_SETS;
}

export function getActiveSeedQuestionSets(): ClarificationQuestionSet[] {
  return SEED_CLARIFICATION_QUESTION_SETS.filter((set) => set.status === "active");
}

export function findSeedQuestionSetByKey(key: string): ClarificationQuestionSet | null {
  return SEED_CLARIFICATION_QUESTION_SETS.find((set) => set.key === key) ?? null;
}

/** Selects candidate question sets for a line using seed sets + bindings. */
export function selectSeedQuestionSetsForLine(
  context: LineMatchContext,
  options?: { limit?: number; minScore?: number },
): ClarificationSetMatch[] {
  return matchQuestionSetsForLine(
    context,
    SEED_CLARIFICATION_QUESTION_SETS,
    SEED_CLARIFICATION_BINDINGS,
    options,
  );
}

/** Resolves a raw user phrase to a canonical active seed set. */
export function resolveSeedSetByAlias(phrase: string): ClarificationQuestionSet | null {
  return resolveActiveSetByAlias(phrase, SEED_CLARIFICATION_QUESTION_SETS);
}
