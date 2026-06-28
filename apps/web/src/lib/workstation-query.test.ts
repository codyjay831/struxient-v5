import assert from "node:assert/strict";
import test from "node:test";
import { LeadVisitRequestStatus } from "@prisma/client";
import { classifyAssignedLeadVisitWorkstationAttention } from "@/lib/scheduling/lead-visit-lead-access";
import {
  JobScheduleEventStatus,
  TaskDueMode,
  TaskSchedulingRequirement,
} from "@prisma/client";
import { deriveSchedulingAttentionOverride } from "./workstation-scheduling-attention";

test("deriveSchedulingAttentionOverride flags REQUIRED tasks without confirmed event", () => {
  const result = deriveSchedulingAttentionOverride({
    derivedState: "READY",
    schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
    linkedEvents: [],
    dueMode: TaskDueMode.NONE,
    dueAt: null,
  });

  assert.ok(result);
  assert.equal(result?.status, "Needs schedule");
});

test("deriveSchedulingAttentionOverride ignores satisfied REQUIRED tasks", () => {
  const futureEnd = new Date(Date.now() + 60 * 60 * 1000);
  const result = deriveSchedulingAttentionOverride({
    derivedState: "READY",
    schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
    linkedEvents: [
      {
        id: "evt-1",
        status: JobScheduleEventStatus.CONFIRMED,
        startAt: new Date(),
        endAt: futureEnd,
      },
    ],
    dueMode: TaskDueMode.MANUAL,
    dueAt: new Date(),
  });

  assert.equal(result, null);
});

test("deriveSchedulingAttentionOverride keeps REQUIRED tasks unscheduled with tentative-only events", () => {
  const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const result = deriveSchedulingAttentionOverride({
    derivedState: "READY",
    schedulingRequirement: TaskSchedulingRequirement.REQUIRED,
    linkedEvents: [
      {
        id: "evt-2",
        status: JobScheduleEventStatus.TENTATIVE,
        startAt: new Date(Date.now() + 60 * 60 * 1000),
        endAt: futureEnd,
      },
    ],
    dueMode: TaskDueMode.NONE,
    dueAt: null,
  });

  assert.ok(result);
  assert.equal(result?.status, "Needs schedule");
});

test("assigned visit workstation cards avoid critical priority for far-future scheduled visits", () => {
  const now = new Date("2026-06-19T12:00:00.000Z");
  const attention = classifyAssignedLeadVisitWorkstationAttention({
    status: LeadVisitRequestStatus.CONFIRMED,
    scheduledStart: new Date("2026-09-01T10:00:00.000Z"),
    hasMissingAccess: false,
    hasMissingOutcome: false,
    now,
  });
  assert.notEqual(attention.priority, "critical");
  assert.equal(attention.lens, "upcoming");
});
