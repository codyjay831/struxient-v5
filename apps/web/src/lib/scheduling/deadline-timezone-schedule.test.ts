import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDatetimeLocalInTimezone,
  parseDatetimeLocalInTimezone,
  wallClockToUtc,
} from "./deadline-timezone";

const TZ = "America/Los_Angeles";

test("wallClockToUtc converts org wall clock to UTC", () => {
  const utc = wallClockToUtc(2026, 6, 17, 9, 30, TZ);
  const formatted = formatDatetimeLocalInTimezone(utc, TZ);
  assert.equal(formatted, "2026-06-17T09:30");
});

test("parseDatetimeLocalInTimezone roundtrips datetime-local values", () => {
  const parsed = parseDatetimeLocalInTimezone("2026-06-17T09:30", TZ);
  assert.equal(formatDatetimeLocalInTimezone(parsed, TZ), "2026-06-17T09:30");
});

test("DST spring-forward day still parses wall clock in org timezone", () => {
  const parsed = parseDatetimeLocalInTimezone("2026-03-08T10:00", TZ);
  assert.equal(formatDatetimeLocalInTimezone(parsed, TZ), "2026-03-08T10:00");
});
