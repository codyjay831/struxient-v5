/**
 * Week range helpers for the Workstation "This week" calendar strip.
 *
 * Mirrors the week window logic used by the Schedule page (Sun–Sat, 7 days),
 * but exposed as a reusable helper so the Board can render a real calendar.
 */

export type WeekRange = { startAt: Date; endAt: Date };

export type WeekDay = {
  /** Local Date at 00:00:00 for this calendar day. */
  date: Date;
  /** UTC instant for end of this calendar day. */
  endOfDay: Date;
  isToday: boolean;
};

/**
 * Returns the Sun–Sat range containing `date`.
 * Boundaries are computed in server-local time, matching the Schedule page.
 */
export function getWeekRange(date: Date = new Date()): WeekRange {
  const startAt = new Date(date);
  const day = startAt.getDay();
  startAt.setDate(startAt.getDate() - day);
  startAt.setHours(0, 0, 0, 0);

  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 6);
  endAt.setHours(23, 59, 59, 999);

  return { startAt, endAt };
}

/**
 * Returns the 7 calendar days (Sun–Sat) for the week containing `date`,
 * each flagged with whether it is today.
 */
export function getWeekDays(date: Date = new Date()): WeekDay[] {
  const { startAt } = getWeekRange(date);
  const now = new Date();

  return Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(startAt);
    dayStart.setDate(startAt.getDate() + i);
    dayStart.setHours(0, 0, 0, 0);

    const endOfDay = new Date(dayStart);
    endOfDay.setHours(23, 59, 59, 999);

    return {
      date: dayStart,
      endOfDay,
      isToday:
        dayStart.getFullYear() === now.getFullYear() &&
        dayStart.getMonth() === now.getMonth() &&
        dayStart.getDate() === now.getDate(),
    };
  });
}

/** True if `instant` falls on the same calendar day as `day` (server-local). */
export function isOnDay(instant: Date, day: Date): boolean {
  return (
    instant.getFullYear() === day.getFullYear() &&
    instant.getMonth() === day.getMonth() &&
    instant.getDate() === day.getDate()
  );
}
