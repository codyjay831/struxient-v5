import assert from "node:assert/strict";
import test from "node:test";
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
