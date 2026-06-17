import assert from "node:assert/strict";
import test from "node:test";
import { buildScheduleFullCalendarViewConfig } from "./schedule-fullcalendar-config";

test("dayGridMonth uses fixedWeekCount false for variable row count", () => {
  const config = buildScheduleFullCalendarViewConfig();
  assert.equal(config.dayGridMonth.fixedWeekCount, false);
  assert.equal(config.dayGridMonth.showNonCurrentDates, true);
  assert.equal(config.dayGridMonth.dayMaxEventRows, true);
});

test("timeGrid views scroll to working hours without clipping the day", () => {
  const config = buildScheduleFullCalendarViewConfig();
  assert.equal(config.timeGridWeek.scrollTime, "06:00:00");
  assert.equal(config.timeGridWeek.scrollTimeReset, false);
  assert.equal(config.timeGridDay.scrollTime, "06:00:00");
  assert.notEqual("slotMinTime" in config.timeGridWeek, true);
  assert.notEqual("slotMaxTime" in config.timeGridWeek, true);
});
