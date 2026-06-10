const DEFAULT_ORG_TIMEZONE = "America/Los_Angeles";

export function getOrgTimezone(timezone: string | null | undefined): string {
  return timezone?.trim() || DEFAULT_ORG_TIMEZONE;
}

/** Calendar date parts for an instant in the given IANA timezone. */
export function getZonedDateParts(instant: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { year, month, day };
}

function isSameCalendarDay(
  parts: { year: number; month: number; day: number },
  year: number,
  month: number,
  day: number,
): boolean {
  return parts.year === year && parts.month === month && parts.day === day;
}

function isBeforeCalendarDay(
  parts: { year: number; month: number; day: number },
  year: number,
  month: number,
  day: number,
): boolean {
  if (parts.year !== year) return parts.year < year;
  if (parts.month !== month) return parts.month < month;
  return parts.day < day;
}

/** UTC instant for end-of-day (latest ms) on a calendar date in org timezone. */
export function calendarDayEndUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  let low = Date.UTC(year, month - 1, day - 1, 0, 0, 0, 0);
  let high = Date.UTC(year, month - 1, day + 1, 23, 59, 59, 999);
  let best: Date | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const parts = getZonedDateParts(new Date(mid), timeZone);
    if (isSameCalendarDay(parts, year, month, day)) {
      best = new Date(mid);
      low = mid + 1;
    } else if (isBeforeCalendarDay(parts, year, month, day)) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!best) {
    throw new Error(`Could not resolve EOD for ${year}-${month}-${day} in ${timeZone}`);
  }

  return best;
}

/** Add calendar days in org timezone and return EOD of the target day. */
export function addCalendarDaysInTimezone(
  anchor: Date,
  days: number,
  timeZone: string,
): Date {
  const { year, month, day } = getZonedDateParts(anchor, timeZone);
  const target = new Date(Date.UTC(year, month - 1, day + days));
  return calendarDayEndUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    timeZone,
  );
}

export function parseDateOnlyInput(dateInput: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  if (!match) {
    throw new Error("Invalid date-only input. Expected YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return calendarDayEndUtc(year, month, day, timeZone);
}

export function isOverdueDeadline(
  dueAt: Date,
  granularity: "DATE_ONLY" | "EXACT" | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  if (granularity === "DATE_ONLY") {
    const dueParts = getZonedDateParts(dueAt, timeZone);
    const nowParts = getZonedDateParts(now, timeZone);
    if (dueParts.year !== nowParts.year) return dueParts.year < nowParts.year;
    if (dueParts.month !== nowParts.month) return dueParts.month < nowParts.month;
    return dueParts.day < nowParts.day;
  }
  return dueAt.getTime() < now.getTime();
}

export function isDueTodayDeadline(
  dueAt: Date,
  granularity: "DATE_ONLY" | "EXACT" | null | undefined,
  timeZone: string,
  now: Date = new Date(),
): boolean {
  const dueParts = getZonedDateParts(dueAt, timeZone);
  const nowParts = getZonedDateParts(now, timeZone);
  return (
    dueParts.year === nowParts.year &&
    dueParts.month === nowParts.month &&
    dueParts.day === nowParts.day
  );
}
