/** In-memory match helpers only — not persisted, no DB columns. */

export function normalizeEmailForMatch(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/** Digits only for exact phone comparison (no country-code normalization). */
export function normalizePhoneDigits(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits === "" ? null : digits;
}
