export const SCHEDULE_VIEWS = ["month", "week", "day", "agenda"] as const;

export type ScheduleUrlView = (typeof SCHEDULE_VIEWS)[number];

export type ParsedScheduleUrlState = {
  /** Null when `view` query param is missing or invalid — client resolves device default. */
  view: ScheduleUrlView | null;
  /** Canonical YYYY-MM-DD anchor date in org timezone semantics. */
  date: string;
};

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidScheduleDateInput(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function formatDateOnlyUtc(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseScheduleViewParam(raw: string | undefined): ScheduleUrlView | null {
  if (!raw) return null;
  return (SCHEDULE_VIEWS as readonly string[]).includes(raw) ? (raw as ScheduleUrlView) : null;
}

export function todayDateOnlyInTimezone(timeZone: string, now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return formatDateOnlyUtc(year, month, day);
}

export function parseScheduleUrlState(
  searchParams: { view?: string; date?: string },
  timeZone: string,
  now: Date = new Date(),
): ParsedScheduleUrlState {
  const view = parseScheduleViewParam(searchParams.view);
  const fallbackDate = todayDateOnlyInTimezone(timeZone, now);
  const rawDate = searchParams.date?.trim();
  const date =
    rawDate && isValidScheduleDateInput(rawDate) ? rawDate : fallbackDate;
  return { view, date };
}

export function buildSchedulePath(view: ScheduleUrlView, date: string): string {
  const params = new URLSearchParams({ view, date });
  return `/schedule?${params.toString()}`;
}

export function shiftScheduleAnchorDate(
  anchorDate: string,
  view: ScheduleUrlView,
  direction: -1 | 1,
): string {
  const match = DATE_ONLY_RE.exec(anchorDate.trim());
  if (!match) return anchorDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);

  if (view === "month") {
    const target = new Date(Date.UTC(year, month - 1 + direction, 1));
    return formatDateOnlyUtc(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
    );
  }

  const stepDays = view === "week" ? 7 : view === "agenda" ? 14 : 1;
  const shifted = new Date(utc + direction * stepDays * 24 * 60 * 60 * 1000);
  return formatDateOnlyUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}
