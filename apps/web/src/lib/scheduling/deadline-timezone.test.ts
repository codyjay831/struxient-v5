import assert from "node:assert/strict";
import test from "node:test";
import { TaskDueAnchor, TaskDueGranularity } from "@prisma/client";
import { computeDerivedDueAt } from "./deadline-service";
import { calendarDayEndUtc, getZonedDateParts } from "./deadline-timezone";

test("calendarDayEndUtc lands on requested org calendar day", () => {
  const end = calendarDayEndUtc(2026, 6, 12, "America/Los_Angeles");
  const parts = getZonedDateParts(end, "America/Los_Angeles");
  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 6);
  assert.equal(parts.day, 12);
});

test("computeDerivedDueAt uses date-only EOD for derived rules", () => {
  const activated = new Date("2026-06-01T15:00:00.000Z");
  const dueAt = computeDerivedDueAt({
    anchor: TaskDueAnchor.JOB_ACTIVATION,
    offsetDays: 3,
    granularity: TaskDueGranularity.DATE_ONLY,
    jobActivatedAt: activated,
    firstReadyAt: activated,
    orgTimezone: "America/Los_Angeles",
  });
  const parts = getZonedDateParts(dueAt, "America/Los_Angeles");
  assert.equal(parts.month, 6);
  assert.equal(parts.day, 4);
});
