import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cleanupActionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "job-schedule-cleanup-actions.ts",
);
const lifecycleActionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "job-lifecycle-actions.ts",
);
const cleanupActionsSource = readFileSync(cleanupActionsPath, "utf8");
const lifecycleActionsSource = readFileSync(lifecycleActionsPath, "utf8");

assert.doesNotMatch(
  cleanupActionsSource,
  /requireMutableSession/,
  "job-schedule-cleanup-actions.ts should not use requireMutableSession",
);
assert.doesNotMatch(
  lifecycleActionsSource,
  /requireMutableSession/,
  "job-lifecycle-actions.ts should not use requireMutableSession",
);

const loadReviewActionSource = cleanupActionsSource.match(
  /export async function loadJobScheduleCleanupReviewAction[\s\S]*?^}/m,
)?.[0];

assert.ok(loadReviewActionSource, "loadJobScheduleCleanupReviewAction should exist");
assert.doesNotMatch(
  loadReviewActionSource,
  /requireMutableSession/,
  "loadJobScheduleCleanupReviewAction should not require mutable session",
);
assert.match(
  loadReviewActionSource,
  /requireCurrentSession/,
  "loadJobScheduleCleanupReviewAction should use current session",
);
assert.match(
  loadReviewActionSource,
  /getJobVisibilityWhere/,
  "loadJobScheduleCleanupReviewAction should scope job read by visibility",
);

assert.match(
  cleanupActionsSource,
  /STAFF_ACTIONS\.JOB_SCHEDULE_CLEANUP_CONFIRM/,
  "confirm cleanup should use JOB_SCHEDULE_CLEANUP_CONFIRM staff action",
);

assert.match(
  lifecycleActionsSource,
  /STAFF_ACTIONS\.JOB_ARCHIVE/,
  "archive should use JOB_ARCHIVE staff action",
);

console.log("job-schedule-cleanup-actions.read.test.ts passed");
