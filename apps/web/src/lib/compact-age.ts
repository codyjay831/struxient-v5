const MS_MIN = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;
/** Eight weeks — above this we show months + weeks (MO + W). */
const MS_8_WEEKS = 56 * MS_DAY;

/**
 * Compact operational age string from `from` to `now` (e.g. `2D 3H`).
 * Intended for server-side serialization with a stable `now` per request —
 * do not pair with `Date.now()` in client components for displayed labels.
 *
 * Tiers:
 * - under 1 hour: minutes only (`42M`)
 * - under 1 day: hours + minutes (`6H 20M`)
 * - under 7 days: days + hours (`2D 3H`)
 * - under 8 weeks: weeks + days (`3W 2D`)
 * - older: approximate months + weeks (`2MO 1W`, `MO` avoids clash with minutes `M`)
 */
export function formatCompactAge(from: Date | string, now: Date): string {
  const fromMs =
    typeof from === "string" ? new Date(from).getTime() : from.getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(nowMs)) {
    return "0M";
  }
  const diff = nowMs - fromMs;
  if (diff <= 0) {
    return "0M";
  }

  if (diff < MS_HOUR) {
    const m = Math.floor(diff / MS_MIN);
    return `${m}M`;
  }

  if (diff < MS_DAY) {
    const totalM = Math.floor(diff / MS_MIN);
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    if (m === 0) return `${h}H`;
    return `${h}H ${m}M`;
  }

  if (diff < 7 * MS_DAY) {
    const totalH = Math.floor(diff / MS_HOUR);
    const d = Math.floor(totalH / 24);
    const h = totalH % 24;
    if (h === 0) return `${d}D`;
    return `${d}D ${h}H`;
  }

  if (diff < MS_8_WEEKS) {
    const totalD = Math.floor(diff / MS_DAY);
    const w = Math.floor(totalD / 7);
    const d = totalD % 7;
    if (d === 0) return `${w}W`;
    return `${w}W ${d}D`;
  }

  const totalD = Math.floor(diff / MS_DAY);
  const mo = Math.floor(totalD / 30);
  const rem = totalD % 30;
  const w = Math.floor(rem / 7);
  if (w === 0) return `${mo}MO`;
  return `${mo}MO ${w}W`;
}
