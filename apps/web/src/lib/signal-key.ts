/**
 * Canonical signal matching helpers.
 *
 * Signals are user-authored strings and historically used different separators
 * (dot, hyphen, underscore). Runtime/readiness logic should treat equivalent
 * spellings as the same signal key.
 */
export function normalizeSignalKey(signal: string): string {
  return signal.trim().toLowerCase().replace(/[\s._-]+/g, "");
}

export function signalsEquivalent(a: string, b: string): boolean {
  return normalizeSignalKey(a) === normalizeSignalKey(b);
}

export function includesEquivalentSignal(
  signals: readonly string[],
  target: string,
): boolean {
  const normalizedTarget = normalizeSignalKey(target);
  return signals.some((signal) => normalizeSignalKey(signal) === normalizedTarget);
}

export function toNormalizedSignalSet(signals: readonly string[]): Set<string> {
  return new Set(signals.map((signal) => normalizeSignalKey(signal)));
}
