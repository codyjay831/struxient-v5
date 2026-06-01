/**
 * Maps AI-returned stage labels to org-scoped Stage.id values.
 * Stages are structural containers only — no workflow semantics here.
 */

export type AllowedStage = {
  id: string;
  name: string;
};

export type StageIntent =
  | "PRE_CONSTRUCTION"
  | "PERMITTING"
  | "MOBILIZATION"
  | "SITE_PREP"
  | "ROUGH_IN"
  | "INSPECTION"
  | "WALKTHROUGH"
  | "INSTALL"
  | "FINISHES"
  | "CLOSEOUT";

export type StageMappingConfidence =
  | "exact"
  | "normalized"
  | "alias"
  | "intent"
  | "unmapped";

export type MapAiStageResult = {
  stageId: string | null;
  confidence: StageMappingConfidence;
  reason?: string;
  warning?: string;
};

export type MapAiStageInput = {
  stageName?: string | null;
  stageKey?: string | null;
  stageIntent?: StageIntent | null;
  allowedStages: AllowedStage[];
};

/** Normalized display label for case/whitespace-insensitive comparison. */
export function normalizeStageLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stageComparisonKey(value: string): string {
  return normalizeStageLabel(value).replace(/\s+/g, "");
}

/**
 * Alias inputs (normalized comparison keys) → candidate org stage name labels.
 * Values are matched against allowedStages via normalizeStageLabel.
 */
const STAGE_NAME_ALIASES: Record<string, readonly string[]> = {
  preparation: ["Site Prep", "Mobilization", "Pre-Construction"],
  prep: ["Site Prep", "Mobilization", "Pre-Construction"],
  preconstruction: ["Pre-Construction"],
  precon: ["Pre-Construction"],
  permitting: ["Permitting", "Engineering & Permits"],
  engineeringpermits: ["Permitting", "Engineering & Permits"],
  engineeringandpermits: ["Permitting", "Engineering & Permits"],
  materials: ["Mobilization", "Site Prep", "Materials"],
  mobilization: ["Mobilization"],
  siteprep: ["Site Prep"],
  roughin: ["Rough-In"],
  rough: ["Rough-In"],
  inspection: ["Inspection"],
  finalinspection: ["Inspection"],
  finalinspect: ["Inspection"],
  install: ["Rough-In", "Finishes", "Installation"],
  installation: ["Finishes", "Rough-In", "Installation"],
  scheduling: ["Mobilization", "Pre-Construction"],
  schedule: ["Mobilization", "Pre-Construction"],
  finishes: ["Finishes"],
  finish: ["Finishes"],
  walkthrough: ["Walkthrough"],
  closeout: ["Closeout", "Final Inspection & Closeout"],
  finalinspectioncloseout: ["Closeout", "Final Inspection & Closeout"],
  wrapup: ["Closeout", "Final Inspection & Closeout"],
  finalization: ["Closeout", "Final Inspection & Closeout"],
};

const STAGE_INTENT_TARGETS: Record<StageIntent, readonly string[]> = {
  PRE_CONSTRUCTION: ["Pre-Construction"],
  PERMITTING: ["Permitting", "Engineering & Permits"],
  MOBILIZATION: ["Mobilization"],
  SITE_PREP: ["Site Prep"],
  ROUGH_IN: ["Rough-In"],
  INSPECTION: ["Inspection"],
  WALKTHROUGH: ["Walkthrough"],
  INSTALL: ["Rough-In", "Finishes", "Installation"],
  FINISHES: ["Finishes"],
  CLOSEOUT: ["Closeout", "Final Inspection & Closeout"],
};

function findStageByNormalizedName(
  allowedStages: AllowedStage[],
  targetLabel: string,
): AllowedStage | undefined {
  const key = stageComparisonKey(targetLabel);
  return allowedStages.find((s) => stageComparisonKey(s.name) === key);
}

function tryMatchLabel(
  allowedStages: AllowedStage[],
  rawLabel: string,
  matchKind: "exact" | "normalized" | "alias",
): MapAiStageResult | null {
  if (!rawLabel.trim() || allowedStages.length === 0) {
    return null;
  }

  if (matchKind === "exact") {
    const lower = rawLabel.trim().toLowerCase();
    const hit = allowedStages.find((s) => s.name.toLowerCase() === lower);
    if (hit) {
      return { stageId: hit.id, confidence: "exact" };
    }
    return null;
  }

  if (matchKind === "normalized") {
    const key = stageComparisonKey(rawLabel);
    const hit = allowedStages.find((s) => stageComparisonKey(s.name) === key);
    if (hit) {
      return { stageId: hit.id, confidence: "normalized" };
    }
    return null;
  }

  const aliasKey = stageComparisonKey(rawLabel);
  const targets = STAGE_NAME_ALIASES[aliasKey];
  if (!targets) {
    return null;
  }

  for (const target of targets) {
    const hit = findStageByNormalizedName(allowedStages, target);
    if (hit) {
      return {
        stageId: hit.id,
        confidence: "alias",
        reason: `Mapped "${rawLabel}" to stage "${hit.name}" via alias.`,
        warning:
          hit.name.toLowerCase() !== rawLabel.trim().toLowerCase()
            ? `Stage "${rawLabel}" was mapped to "${hit.name}".`
            : undefined,
      };
    }
  }

  return null;
}

function tryIntentMatch(
  allowedStages: AllowedStage[],
  intent: StageIntent,
): MapAiStageResult | null {
  const targets = STAGE_INTENT_TARGETS[intent];
  for (const target of targets) {
    const hit = findStageByNormalizedName(allowedStages, target);
    if (hit) {
      return {
        stageId: hit.id,
        confidence: "intent",
        reason: `Mapped stage intent ${intent} to "${hit.name}".`,
        warning: `Stage intent ${intent} was mapped to "${hit.name}".`,
      };
    }
  }
  return null;
}

export function parseStageIntent(raw: unknown): StageIntent | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  const key = raw.trim().toUpperCase() as StageIntent;
  return key in STAGE_INTENT_TARGETS ? key : null;
}

export function mapAiStageToStageId(input: MapAiStageInput): MapAiStageResult {
  const { allowedStages, stageIntent } = input;

  if (allowedStages.length === 0) {
    return { stageId: null, confidence: "unmapped", reason: "No stages configured for this organization." };
  }

  const labels: string[] = [];
  if (input.stageKey?.trim()) {
    labels.push(input.stageKey.trim());
  }
  if (input.stageName?.trim()) {
    const name = input.stageName.trim();
    if (!labels.some((l) => stageComparisonKey(l) === stageComparisonKey(name))) {
      labels.push(name);
    }
  }

  for (const label of labels) {
    const exact = tryMatchLabel(allowedStages, label, "exact");
    if (exact) {
      return exact;
    }
    const normalized = tryMatchLabel(allowedStages, label, "normalized");
    if (normalized) {
      return normalized;
    }
    const alias = tryMatchLabel(allowedStages, label, "alias");
    if (alias) {
      return alias;
    }
  }

  if (stageIntent) {
    const intentHit = tryIntentMatch(allowedStages, stageIntent);
    if (intentHit) {
      return intentHit;
    }
  }

  const labelHint = labels[0] ?? stageIntent ?? "unknown";
  return {
    stageId: null,
    confidence: "unmapped",
    reason: `Could not map stage "${labelHint}" to an existing organization stage.`,
  };
}

export type ExecutionStageContext = "quote_line" | "line_item_default_execution";

export function validateExecutionTaskStage(
  stageId: string | null,
  context: ExecutionStageContext,
): { ok: true } | { ok: false; message: string } {
  if (stageId) {
    return { ok: true };
  }

  if (context === "quote_line") {
    return {
      ok: false,
      message: "Every quote execution task must have a stage before it can be saved.",
    };
  }

  return {
    ok: false,
    message: "Every default execution task must have a stage before it can be saved.",
  };
}
