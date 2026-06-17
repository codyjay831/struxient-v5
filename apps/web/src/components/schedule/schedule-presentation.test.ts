import assert from "node:assert/strict";
import test from "node:test";
import { formatSchedulePeriodTitle } from "@/components/schedule/schedule-presentation";

const TZ = "America/Los_Angeles";

test("formatSchedulePeriodTitle uses canonical URL state for month view", () => {
  assert.equal(formatSchedulePeriodTitle("month", "2026-06-17", TZ), "June 2026");
});

test("formatSchedulePeriodTitle uses canonical URL state for day view", () => {
  const title = formatSchedulePeriodTitle("day", "2026-06-17", TZ);
  assert.match(title, /June 17, 2026/);
  assert.match(title, /Wednesday/);
});

test("formatSchedulePeriodTitle uses canonical URL state for week view", () => {
  const title = formatSchedulePeriodTitle("week", "2026-06-18", TZ);
  assert.match(title, /June 14/);
  assert.match(title, /June 20, 2026/);
});
