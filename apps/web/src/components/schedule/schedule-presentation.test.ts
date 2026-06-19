import assert from "node:assert/strict";
import test from "node:test";
import { formatSchedulePeriodTitle, getScheduleStatusLabel } from "@/components/schedule/schedule-presentation";

const TZ = "America/Los_Angeles";

test("formatSchedulePeriodTitle uses canonical URL state for month view", () => {
  assert.equal(formatSchedulePeriodTitle("month", "2026-06-17", TZ), "June 2026");
});

test("formatSchedulePeriodTitle uses canonical URL state for day view", () => {
  const title = formatSchedulePeriodTitle("day", "2026-06-17", TZ);
  assert.match(title, /June 17, 2026/);
  assert.match(title, /Wednesday/);
});

test("lead visit CONFIRMED displays as Scheduled not customer confirmed", () => {
  assert.equal(
    getScheduleStatusLabel({
      id: "lead-visit-1",
      kind: "lead-visit-request",
      title: "Lead",
      status: "CONFIRMED",
      startAt: new Date("2026-06-20T10:00:00.000Z"),
      endAt: null,
      recordId: "visit-1",
    }),
    "Scheduled",
  );
});
