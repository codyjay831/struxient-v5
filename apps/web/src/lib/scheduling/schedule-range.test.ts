import assert from "node:assert/strict";
import test from "node:test";
import {
  eventOverlapsHalfOpenRange,
  getAgendaRange,
  getDayRange,
  getMonthVisibleGridRange,
  getWeekRange,
} from "./schedule-range";
import { getZonedDateTimeParts } from "./deadline-timezone";

const TZ = "America/Los_Angeles";

function formatRangeLabel(range: { startInclusive: Date; endExclusive: Date }) {
  const start = getZonedDateTimeParts(range.startInclusive, TZ);
  const end = getZonedDateTimeParts(range.endExclusive, TZ);
  return `${start.year}-${start.month}-${start.day} → ${end.year}-${end.month}-${end.day}`;
}

test("getDayRange is half-open for one org calendar day", () => {
  const range = getDayRange("2026-06-17", TZ);
  const start = getZonedDateTimeParts(range.startInclusive, TZ);
  const end = getZonedDateTimeParts(range.endExclusive, TZ);
  assert.deepEqual(
    { y: start.year, m: start.month, d: start.day, h: start.hour },
    { y: 2026, m: 6, d: 17, h: 0 },
  );
  assert.deepEqual(
    { y: end.year, m: end.month, d: end.day, h: end.hour },
    { y: 2026, m: 6, d: 18, h: 0 },
  );
});

test("getWeekRange uses Sunday-start week containing anchor", () => {
  const range = getWeekRange("2026-06-18", TZ); // Thursday
  assert.equal(formatRangeLabel(range), "2026-6-14 → 2026-6-21");
});

test("getAgendaRange spans 14 days from anchor start", () => {
  const range = getAgendaRange("2026-06-17", TZ);
  assert.equal(formatRangeLabel(range), "2026-6-17 → 2026-7-1");
});

function countWeeksInRange(range: { startInclusive: Date; endExclusive: Date }): number {
  const ms = range.endExclusive.getTime() - range.startInclusive.getTime();
  return ms / (7 * 24 * 60 * 60 * 1000);
}

test("getMonthVisibleGridRange includes adjacent-month cells", () => {
  const range = getMonthVisibleGridRange("2026-06-17", TZ);
  assert.equal(formatRangeLabel(range), "2026-5-31 → 2026-7-5");
  assert.equal(countWeeksInRange(range), 5);
});

test("getMonthVisibleGridRange uses four weeks for February 2026", () => {
  const range = getMonthVisibleGridRange("2026-02-15", TZ);
  assert.equal(formatRangeLabel(range), "2026-2-1 → 2026-3-1");
  assert.equal(countWeeksInRange(range), 4);
});

test("getMonthVisibleGridRange uses six weeks for August 2026", () => {
  const range = getMonthVisibleGridRange("2026-08-15", TZ);
  assert.equal(formatRangeLabel(range), "2026-7-26 → 2026-9-6");
  assert.equal(countWeeksInRange(range), 6);
});

test("eventOverlapsHalfOpenRange handles midnight-spanning events", () => {
  const range = getDayRange("2026-06-17", TZ);
  const overlaps = eventOverlapsHalfOpenRange(
    {
      startAt: new Date("2026-06-17T07:00:00.000Z"),
      endAt: new Date("2026-06-18T06:30:00.000Z"),
    },
    range,
  );
  assert.equal(overlaps, true);
});

test("eventOverlapsHalfOpenRange excludes events starting at exclusive end", () => {
  const range = getDayRange("2026-06-17", TZ);
  const overlaps = eventOverlapsHalfOpenRange(
    {
      startAt: range.endExclusive,
      endAt: new Date(range.endExclusive.getTime() + 3_600_000),
    },
    range,
  );
  assert.equal(overlaps, false);
});
