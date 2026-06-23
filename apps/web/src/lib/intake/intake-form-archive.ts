/**
 * Specialized public intake forms may be soft-archived via `archivedAt`.
 * Default customer and office forms cannot be archived.
 */
export function canArchiveSpecializedIntakeForm(form: {
  isDefault: boolean;
  channel: string;
  isPublic: boolean;
}): boolean {
  if (form.isDefault) {
    return false;
  }
  return form.channel === "WEB_FORM" && form.isPublic === true;
}

/** Archived additional public WEB_FORM links may be restored. */
export function canRestoreSpecializedIntakeForm(form: {
  isDefault: boolean;
  channel: string;
  isPublic: boolean;
}): boolean {
  return canArchiveSpecializedIntakeForm(form);
}
