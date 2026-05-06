import { ExecutionStageKey } from "@prisma/client";

/** Fixed V1 execution phases — keys match [ExecutionStageKey] in Prisma; labels are contractor-facing. */
const STAGE_DEFS: readonly { key: ExecutionStageKey; label: string; sortOrder: number }[] = [
  { key: ExecutionStageKey.intake_review, label: "Intake & review", sortOrder: 0 },
  { key: ExecutionStageKey.site_visit, label: "Site visit", sortOrder: 1 },
  { key: ExecutionStageKey.pre_install, label: "Pre-install", sortOrder: 2 },
  { key: ExecutionStageKey.permitting, label: "Permitting", sortOrder: 3 },
  { key: ExecutionStageKey.materials, label: "Materials", sortOrder: 4 },
  { key: ExecutionStageKey.installation, label: "Installation", sortOrder: 5 },
  { key: ExecutionStageKey.inspection, label: "Inspection", sortOrder: 6 },
  { key: ExecutionStageKey.corrections, label: "Corrections", sortOrder: 7 },
  { key: ExecutionStageKey.closeout, label: "Closeout", sortOrder: 8 },
] as const;

const STAGE_LABEL_BY_KEY = Object.fromEntries(
  STAGE_DEFS.map((d) => [d.key, d.label]),
) as Record<ExecutionStageKey, string>;

/** Canonical stage keys in execution order (for merge / display later). */
export const EXECUTION_STAGE_KEYS_ORDERED: readonly ExecutionStageKey[] = STAGE_DEFS.map(
  (d) => d.key,
);

export function isExecutionStageKey(value: string): value is ExecutionStageKey {
  return (Object.values(ExecutionStageKey) as string[]).includes(value);
}

/** Parse a wire/form value into [ExecutionStageKey], or `null` if invalid. */
export function parseExecutionStageKey(
  value: FormDataEntryValue | string | null | undefined,
): ExecutionStageKey | null {
  if (value == null || typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return isExecutionStageKey(trimmed) ? trimmed : null;
}

export function getExecutionStageLabel(key: ExecutionStageKey): string {
  return STAGE_LABEL_BY_KEY[key];
}

/** `{ value, label }` for HTML selects — stable execution order. */
export function executionStageSelectOptions(): { value: ExecutionStageKey; label: string }[] {
  return STAGE_DEFS.map(({ key, label }) => ({ value: key, label }));
}

export function getExecutionStageSortOrder(key: ExecutionStageKey): number {
  const row = STAGE_DEFS.find((d) => d.key === key);
  return row?.sortOrder ?? 999;
}
