import type { ScheduleUrlView } from "./schedule-url-state";
import {
  addCalendarDaysStart,
  calendarDayStartUtc,
  getZonedDayOfWeek,
  parseDateOnlyAnchor,
} from "./deadline-timezone";

/** Half-open schedule query range: [startInclusive, endExclusive). */
export type ScheduleHalfOpenRange = {
  startInclusive: Date;
  endExclusive: Date;
};

/** Legacy query shape used by schedule projection helpers. */
export type ScheduleQueryRange = {
  startAt: Date;
  endAt: Date;
};

export function toScheduleQueryRange(range: ScheduleHalfOpenRange): ScheduleQueryRange {
  return { startAt: range.startInclusive, endAt: range.endExclusive };
}

export function eventOverlapsHalfOpenRange(
  event: { startAt: Date; endAt: Date | null },
  range: ScheduleHalfOpenRange,
): boolean {
  const eventEnd = event.endAt ?? new Date(event.startAt.getTime() + 60_000);
  return event.startAt < range.endExclusive && eventEnd > range.startInclusive;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseAnchorParts(anchorDate: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchorDate.trim());
  if (!match) {
    throw new Error("Invalid anchor date. Expected YYYY-MM-DD.");
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

/** Sunday-start week containing anchor date. */
export function getWeekRange(
  anchorDate: string,
  timeZone: string,
): ScheduleHalfOpenRange {
  const { year, month, day } = parseAnchorParts(anchorDate);
  const anchorStart = calendarDayStartUtc(year, month, day, timeZone);
  const dow = getZonedDayOfWeek(anchorStart, timeZone);
  const startInclusive = addCalendarDaysStart(year, month, day, -dow, timeZone);
  const endExclusive = addCalendarDaysStart(year, month, day, 7 - dow, timeZone);
  return { startInclusive, endExclusive };
}

/** One org-timezone calendar day containing anchor date. */
export function getDayRange(
  anchorDate: string,
  timeZone: string,
): ScheduleHalfOpenRange {
  const startInclusive = parseDateOnlyAnchor(anchorDate, timeZone);
  const { year, month, day } = parseAnchorParts(anchorDate);
  const endExclusive = addCalendarDaysStart(year, month, day, 1, timeZone);
  return { startInclusive, endExclusive };
}

/** 14-day rolling period from anchor date start (exclusive end at anchor + 14 days). */
export function getAgendaRange(
  anchorDate: string,
  timeZone: string,
): ScheduleHalfOpenRange {
  const startInclusive = parseDateOnlyAnchor(anchorDate, timeZone);
  const { year, month, day } = parseAnchorParts(anchorDate);
  const endExclusive = addCalendarDaysStart(year, month, day, 14, timeZone);
  return { startInclusive, endExclusive };
}

/**
 * Full visible month grid including leading/trailing adjacent-month cells.
 * Week starts Sunday.
 */
export function getMonthVisibleGridRange(
  anchorDate: string,
  timeZone: string,
): ScheduleHalfOpenRange {
  const { year, month } = parseAnchorParts(anchorDate);
  const firstDayStart = calendarDayStartUtc(year, month, 1, timeZone);
  const firstDow = getZonedDayOfWeek(firstDayStart, timeZone);
  const startInclusive = addCalendarDaysStart(year, month, 1, -firstDow, timeZone);

  const lastDay = daysInMonth(year, month);
  const lastDayStart = calendarDayStartUtc(year, month, lastDay, timeZone);
  const lastDow = getZonedDayOfWeek(lastDayStart, timeZone);
  const daysToSaturday = 6 - lastDow;
  const endExclusive = addCalendarDaysStart(year, month, lastDay, daysToSaturday + 1, timeZone);

  return { startInclusive, endExclusive };
}

export function getScheduleRangeForView(
  anchorDate: string,
  view: ScheduleUrlView,
  timeZone: string,
): ScheduleHalfOpenRange {
  switch (view) {
    case "month":
      return getMonthVisibleGridRange(anchorDate, timeZone);
    case "week":
      return getWeekRange(anchorDate, timeZone);
    case "day":
      return getDayRange(anchorDate, timeZone);
    case "agenda":
      return getAgendaRange(anchorDate, timeZone);
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}
