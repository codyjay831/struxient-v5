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

/** UTC instant for start-of-day (earliest ms) on a calendar date in org timezone. */
export function calendarDayStartUtc(
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
      high = mid - 1;
    } else if (isBeforeCalendarDay(parts, year, month, day)) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!best) {
    throw new Error(`Could not resolve SOD for ${year}-${month}-${day} in ${timeZone}`);
  }

  return best;
}

/** Sunday = 0 … Saturday = 6 in the given IANA timezone. */
export function getZonedDayOfWeek(instant: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(instant);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = map[weekday];
  if (dow === undefined) {
    throw new Error(`Unknown weekday label: ${weekday}`);
  }
  return dow;
}

export function getZonedDateTimeParts(
  instant: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value),
    hour: Number(parts.find((p) => p.type === "hour")?.value),
    minute: Number(parts.find((p) => p.type === "minute")?.value),
  };
}

/** Convert org-timezone wall-clock parts to a UTC instant. */
export function wallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const parts = getZonedDateTimeParts(new Date(utc), timeZone);
    const targetMinutes = (((year * 372 + month) * 31 + day) * 24 + hour) * 60 + minute;
    const actualMinutes =
      (((parts.year * 372 + parts.month) * 31 + parts.day) * 24 + parts.hour) * 60 +
      parts.minute;
    const deltaMinutes = actualMinutes - targetMinutes;
    if (deltaMinutes === 0) break;
    utc -= deltaMinutes * 60_000;
  }
  return new Date(utc);
}

/** Parse YYYY-MM-DD as start-of-day in org timezone. */
export function parseDateOnlyAnchor(dateInput: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput.trim());
  if (!match) {
    throw new Error("Invalid date-only input. Expected YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return calendarDayStartUtc(year, month, day, timeZone);
}

/** Add calendar days from a date-only anchor and return start-of-day in org timezone. */
export function addCalendarDaysStart(
  year: number,
  month: number,
  day: number,
  days: number,
  timeZone: string,
): Date {
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return calendarDayStartUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    timeZone,
  );
}

/** Parse `datetime-local` value as org-timezone wall clock before UTC conversion. */
export function parseDatetimeLocalInTimezone(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error("Invalid datetime-local input. Expected YYYY-MM-DDTHH:mm.");
  }
  return wallClockToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    timeZone,
  );
}

/** Format a UTC instant for `datetime-local` input in org timezone. */
export function formatDatetimeLocalInTimezone(instant: Date, timeZone: string): string {
  const parts = getZonedDateTimeParts(instant, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
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
