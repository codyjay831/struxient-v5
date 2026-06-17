import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSchedulePath,
  isValidScheduleDateInput,
  parseScheduleUrlState,
  parseScheduleViewParam,
  shiftScheduleAnchorDate,
} from "./schedule-url-state";

test("parseScheduleViewParam accepts canonical views", () => {
  assert.equal(parseScheduleViewParam("week"), "week");
  assert.equal(parseScheduleViewParam("agenda"), "agenda");
});

test("parseScheduleViewParam rejects invalid and dispatch views", () => {
  assert.equal(parseScheduleViewParam("dispatch"), null);
  assert.equal(parseScheduleViewParam("nope"), null);
  assert.equal(parseScheduleViewParam(undefined), null);
});

test("isValidScheduleDateInput validates real calendar dates", () => {
  assert.equal(isValidScheduleDateInput("2026-06-17"), true);
  assert.equal(isValidScheduleDateInput("2026-02-30"), false);
  assert.equal(isValidScheduleDateInput("06-17-2026"), false);
});

test("parseScheduleUrlState falls back date when invalid", () => {
  const parsed = parseScheduleUrlState(
    { view: "month", date: "bad-date" },
    "America/Los_Angeles",
    new Date("2026-06-17T18:00:00.000Z"),
  );
  assert.equal(parsed.view, "month");
  assert.equal(parsed.date, "2026-06-17");
});

test("buildSchedulePath roundtrips view and date", () => {
  assert.equal(
    buildSchedulePath("day", "2026-06-17"),
    "/schedule?view=day&date=2026-06-17",
  );
});

test("shiftScheduleAnchorDate moves month anchors by one month", () => {
  assert.equal(
    shiftScheduleAnchorDate("2026-06-17", "month", 1),
    "2026-07-01",
  );
});

test("shiftScheduleAnchorDate moves week anchors by seven days", () => {
  assert.equal(
    shiftScheduleAnchorDate("2026-06-17", "week", -1),
    "2026-06-10",
  );
});
