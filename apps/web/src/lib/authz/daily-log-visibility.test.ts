import assert from "node:assert/strict";
import { StaffRole } from "@prisma/client";
import {
  canManageDailyLogCoordination,
  canReadDailyLogInternalNotes,
  canWriteDailyLogInternalNotes,
  dailyJobLogSelectForRole,
  redactDailyLogInternalNotesForRole,
  redactDailyLogsForRole,
} from "./daily-log-visibility";

for (const role of [StaffRole.OWNER, StaffRole.ADMIN, StaffRole.OFFICE] as const) {
  assert.equal(canReadDailyLogInternalNotes(role), true, `${role} should read internal notes`);
  assert.equal(canWriteDailyLogInternalNotes(role), true, `${role} should write internal notes`);
  assert.equal(canManageDailyLogCoordination(role), true, `${role} should manage daily log coordination`);
}

assert.equal(canReadDailyLogInternalNotes(StaffRole.VIEWER), true, "VIEWER should read internal notes via read.commercial");
assert.equal(canWriteDailyLogInternalNotes(StaffRole.VIEWER), false, "VIEWER should not write internal notes");
assert.equal(canManageDailyLogCoordination(StaffRole.VIEWER), false, "VIEWER should not review/void daily logs");

for (const role of [StaffRole.FIELD, StaffRole.SUBCONTRACTOR] as const) {
  assert.equal(canReadDailyLogInternalNotes(role), false, `${role} should not read internal notes`);
  assert.equal(canWriteDailyLogInternalNotes(role), false, `${role} should not write internal notes`);
  assert.equal(canManageDailyLogCoordination(role), false, `${role} should not manage daily log coordination`);
}

const officeSelect = dailyJobLogSelectForRole(StaffRole.OFFICE);
assert.equal("internalNotes" in officeSelect, true, "office select includes internalNotes");

const fieldSelect = dailyJobLogSelectForRole(StaffRole.FIELD);
assert.equal("internalNotes" in fieldSelect, false, "field select omits internalNotes");
assert.equal("summary" in fieldSelect, true, "field select still includes summary");

const sampleLog = {
  id: "log-1",
  logDate: new Date("2026-06-01"),
  summary: "Installed panels",
  internalNotes: "Customer complained about noise",
  status: "DRAFT" as const,
};

const fieldLog = redactDailyLogInternalNotesForRole(sampleLog, StaffRole.FIELD);
assert.equal(fieldLog.summary, "Installed panels");
assert.equal(fieldLog.internalNotes, null);

const officeLog = redactDailyLogInternalNotesForRole(sampleLog, StaffRole.OFFICE);
assert.equal(officeLog.internalNotes, "Customer complained about noise");

const redactedList = redactDailyLogsForRole([sampleLog], StaffRole.SUBCONTRACTOR);
assert.equal(redactedList[0]?.internalNotes, null);
assert.equal(redactedList[0]?.summary, "Installed panels");
