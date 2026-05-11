/**
 * Display-only phone formatting. Returns the original string when confidence is low so
 * international and extension-bearing numbers are not mangled.
 */
export function formatPhoneForDisplay(raw: string | null | undefined): string {
  if (raw == null) {
    return "";
  }
  const s = raw.trim();
  if (!s) {
    return "";
  }

  const digits = s.replace(/\D/g, "");

  /** Explicit extension — preserve verbatim */
  if (/\b(ext|extension|x)\s*[.:]?\s*\d+/i.test(s)) {
    return s;
  }

  /** International E.164-style — light touch only for known NANP (+1 + 10 digits) */
  if (s.startsWith("+")) {
    if (digits.length === 11 && digits.startsWith("1")) {
      const ten = digits.slice(1);
      return `+1 (${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
    }
    return s;
  }

  /** US 10-digit domestic */
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  /** US with trunk 1 */
  if (digits.length === 11 && digits.startsWith("1")) {
    const ten = digits.slice(1);
    return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  }

  return s;
}
