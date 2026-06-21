import assert from "node:assert/strict";
import test from "node:test";
import { StaffRole } from "@prisma/client";
import {
  clampWorkstationUrlStateForRole,
  getSpecForRole,
} from "./role-feeds";
import type { WorkstationUrlState } from "./url-state";

const baseState: WorkstationUrlState = {
  v: 1,
  tab: "overview",
  lens: "attention",
  filter: "all",
};

test("getSpecForRole gives field workers calendar default and no commercial tab", () => {
  const spec = getSpecForRole(StaffRole.FIELD);
  assert.equal(spec.defaultTab, "calendar");
  assert.ok(!spec.allowedTabs.includes("commercial"));
  assert.ok(!spec.allowedTabs.includes("money"));
});

test("getSpecForRole gives subcontractor tasks/calendar/activity only", () => {
  const spec = getSpecForRole(StaffRole.SUBCONTRACTOR);
  assert.deepEqual(spec.allowedTabs, ["tasks", "calendar", "activity"]);
  assert.ok(!spec.allowedLenses.includes("attention"));
});

test("clampWorkstationUrlStateForRole returns null when state is valid", () => {
  const clamped = clampWorkstationUrlStateForRole(
    { ...baseState, tab: "calendar", lens: "today" },
    StaffRole.FIELD,
  );
  assert.equal(clamped, null);
});

test("clampWorkstationUrlStateForRole redirects field away from commercial tab", () => {
  const clamped = clampWorkstationUrlStateForRole(
    { ...baseState, tab: "commercial", lens: "today" },
    StaffRole.FIELD,
  );
  assert.ok(clamped);
  assert.equal(clamped.tab, "calendar");
  assert.equal(clamped.lens, "today");
});

test("clampWorkstationUrlStateForRole redirects field away from attention lens", () => {
  const clamped = clampWorkstationUrlStateForRole(
    { ...baseState, tab: "tasks", lens: "attention" },
    StaffRole.FIELD,
  );
  assert.ok(clamped);
  assert.equal(clamped.lens, "today");
});

test("clampWorkstationUrlStateForRole allows owner on all tabs", () => {
  const clamped = clampWorkstationUrlStateForRole(
    { ...baseState, tab: "commercial", lens: "attention" },
    StaffRole.OWNER,
  );
  assert.equal(clamped, null);
});
