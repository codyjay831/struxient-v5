export type IntakeFormSlugCreateAction = "create" | "error_active" | "restore_archived";

/** Resolves whether a slug can be used for a new additional customer request link. */
export function resolveIntakeFormSlugOnCreate(
  existing: { archivedAt: Date | null; isDefault: boolean } | null,
): IntakeFormSlugCreateAction {
  if (!existing) {
    return "create";
  }
  if (existing.archivedAt === null || existing.isDefault) {
    return "error_active";
  }
  return "restore_archived";
}
