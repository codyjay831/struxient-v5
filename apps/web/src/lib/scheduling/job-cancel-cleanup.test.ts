import assert from "node:assert/strict";
import test from "node:test";
import {
  JobScheduleEventKind,
  JobScheduleEventStatus,
  JobStatus,
} from "@prisma/client";
import {
  buildScheduleCleanupReviewItems,
  deriveJobNeedsScheduleCleanup,
  isInternalScheduleEventKind,
  validateScheduleCleanupSelections,
} from "./job-cancel-cleanup";

const futureEnd = new Date("2026-12-01T18:00:00.000Z");
const now = new Date("2026-06-09T12:00:00.000Z");

const baseEvent = {
  id: "evt-1",
  status: JobScheduleEventStatus.CONFIRMED,
  title: "Panel install",
  startAt: new Date("2026-12-01T08:00:00.000Z"),
  endAt: futureEnd,
  leadUserId: null,
  legacyVisitId: null,
};

test("isInternalScheduleEventKind identifies crew and office work", () => {
  assert.equal(isInternalScheduleEventKind(JobScheduleEventKind.CREW_WORK), true);
  assert.equal(isInternalScheduleEventKind(JobScheduleEventKind.SITE_VISIT), false);
});

test("buildScheduleCleanupReviewItems preselects internal events only", () => {
  const items = buildScheduleCleanupReviewItems(
    [
      { ...baseEvent, id: "internal", kind: JobScheduleEventKind.CREW_WORK },
      { ...baseEvent, id: "external", kind: JobScheduleEventKind.INSPECTION },
    ],
    now,
  );

  assert.equal(items.length, 2);
  const internal = items.find((item) => item.id === "internal");
  const external = items.find((item) => item.id === "external");
  assert.equal(internal?.preselected, true);
  assert.equal(internal?.requiresExplicitReview, false);
  assert.equal(external?.preselected, false);
  assert.equal(external?.requiresExplicitReview, true);
});

test("validateScheduleCleanupSelections rejects unchecked external cancel", () => {
  const reviewItems = buildScheduleCleanupReviewItems(
    [{ ...baseEvent, kind: JobScheduleEventKind.UTILITY_APPOINTMENT }],
    now,
  );
  const result = validateScheduleCleanupSelections(reviewItems, [
    { eventId: "evt-1", cancel: true },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /explicit review/i);
  }
});

test("validateScheduleCleanupSelections accepts explicit external selection with reason", () => {
  const reviewItems = buildScheduleCleanupReviewItems(
    [{ ...baseEvent, kind: JobScheduleEventKind.INSPECTION }],
    now,
  );
  const result = validateScheduleCleanupSelections(reviewItems, [
    {
      eventId: "evt-1",
      cancel: true,
      explicitlySelected: true,
      reason: "Job archived; confirm with AHJ.",
    },
  ]);
  assert.equal(result.ok, true);
});

test("deriveJobNeedsScheduleCleanup is true only for archived jobs with future events", () => {
  assert.equal(
    deriveJobNeedsScheduleCleanup({
      jobStatus: JobStatus.ACTIVE,
      pendingEvents: [{ ...baseEvent, kind: JobScheduleEventKind.CREW_WORK }],
    }),
    false,
  );
  assert.equal(
    deriveJobNeedsScheduleCleanup({
      jobStatus: JobStatus.ARCHIVED,
      pendingEvents: [{ ...baseEvent, kind: JobScheduleEventKind.CREW_WORK }],
      now,
    }),
    true,
  );
});
