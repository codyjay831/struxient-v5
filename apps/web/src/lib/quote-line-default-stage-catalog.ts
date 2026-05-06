import { ExecutionStageKey } from "@prisma/client";

/**
 * UI-only catalog for quote-line draft execution: five named stage sections.
 *
 * The persisted [ExecutionStageKey] enum still has nine values (legacy / future use).
 * This catalog groups them into five visible buckets so the inline editor on the
 * quote page never shows a stage dropdown — each "Add task" button is tied to
 * one default-stage bucket and writes a single canonical [ExecutionStageKey].
 *
 * Existing tasks with any of the nine enum values still render under the right
 * bucket via [groupKeyForStageKey].
 */

export type QuoteLineDefaultStageId =
  | "preConstruction"
  | "engineeringPermits"
  | "materials"
  | "installation"
  | "finalInspectionCloseout";

export type QuoteLineDefaultStage = {
  id: QuoteLineDefaultStageId;
  label: string;
  /** Canonical underlying enum used when adding a new task in this stage section. */
  defaultStageKey: ExecutionStageKey;
  /** All underlying enum values that should display in this stage section. */
  memberStageKeys: readonly ExecutionStageKey[];
};

const STAGE_DEFS: readonly QuoteLineDefaultStage[] = [
  {
    id: "preConstruction",
    label: "Pre-Construction",
    defaultStageKey: ExecutionStageKey.pre_install,
    memberStageKeys: [
      ExecutionStageKey.intake_review,
      ExecutionStageKey.site_visit,
      ExecutionStageKey.pre_install,
    ],
  },
  {
    id: "engineeringPermits",
    label: "Engineering & Permits",
    defaultStageKey: ExecutionStageKey.permitting,
    memberStageKeys: [ExecutionStageKey.permitting],
  },
  {
    id: "materials",
    label: "Materials",
    defaultStageKey: ExecutionStageKey.materials,
    memberStageKeys: [ExecutionStageKey.materials],
  },
  {
    id: "installation",
    label: "Installation",
    defaultStageKey: ExecutionStageKey.installation,
    memberStageKeys: [ExecutionStageKey.installation],
  },
  {
    id: "finalInspectionCloseout",
    label: "Final Inspection & Closeout",
    defaultStageKey: ExecutionStageKey.closeout,
    memberStageKeys: [
      ExecutionStageKey.inspection,
      ExecutionStageKey.corrections,
      ExecutionStageKey.closeout,
    ],
  },
];

const GROUP_BY_MEMBER: Record<ExecutionStageKey, QuoteLineDefaultStageId> = (() => {
  const map = {} as Record<ExecutionStageKey, QuoteLineDefaultStageId>;
  for (const def of STAGE_DEFS) {
    for (const mk of def.memberStageKeys) {
      map[mk] = def.id;
    }
  }
  return map;
})();

export const QUOTE_LINE_DEFAULT_STAGES_ORDERED: readonly QuoteLineDefaultStage[] = STAGE_DEFS;

export function getQuoteLineDefaultStageById(
  id: QuoteLineDefaultStageId,
): QuoteLineDefaultStage {
  const found = STAGE_DEFS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Unknown quote-line default stage id: ${id}`);
  }
  return found;
}

/** Map any persisted [ExecutionStageKey] to one of the five UI stage buckets. */
export function groupKeyForStageKey(stageKey: ExecutionStageKey): QuoteLineDefaultStageId {
  return GROUP_BY_MEMBER[stageKey] ?? STAGE_DEFS[0].id;
}
