import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StaffRole } from "@prisma/client";
import { canMutate } from "@/lib/authz/capabilities";

assert.equal(canMutate(StaffRole.VIEWER), false, "VIEWER should not pass mutable session gate");
assert.equal(canMutate(StaffRole.SUBCONTRACTOR), false, "SUB should not pass mutable session gate");

const scheduleActionsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "schedule-actions.ts");
const scheduleActionsSource = readFileSync(scheduleActionsPath, "utf8");

assert.doesNotMatch(
  scheduleActionsSource,
  /requireMutableSession/,
  "schedule-actions.ts should not use requireMutableSession after Phase 3",
);

const readActionSource = scheduleActionsSource.match(
  /export async function getLeadVisitScheduleContextAction[\s\S]*?^}/m,
)?.[0];

assert.ok(readActionSource, "getLeadVisitScheduleContextAction should exist");
assert.doesNotMatch(
  readActionSource,
  /requireMutableSession/,
  "lead visit schedule context read should not require mutable session",
);
assert.match(
  readActionSource,
  /requireCurrentSession/,
  "lead visit schedule context read should use current session",
);

console.log("schedule-actions.read.test.ts passed");
