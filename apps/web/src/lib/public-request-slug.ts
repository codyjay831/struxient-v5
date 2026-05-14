/**
 * URL-safe company slug segment: lowercase letters, digits, single hyphens between tokens.
 * Used so garbage paths fail closed without hitting the database.
 */
export function isValidPublicCompanySlugSegment(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (s.length < 2 || s.length > 64) {
    return false;
  }
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

/**
 * URL-safe intake form slug segment: lowercase letters, digits, single hyphens between tokens.
 * Matches the same rules as company slugs.
 */
export function isValidPublicFormSlugSegment(raw: string): boolean {
  return isValidPublicCompanySlugSegment(raw);
}
