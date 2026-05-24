import test from "node:test";
import assert from "node:assert/strict";
import { buildIssueCreateHref, shouldCreateFieldEventTask } from "@/lib/job-event-intent";

test("shouldCreateFieldEventTask only allows hold-work", () => {
  assert.equal(shouldCreateFieldEventTask("hold-work"), true);
  assert.equal(shouldCreateFieldEventTask("report-issue"), false);
});

test("buildIssueCreateHref targets canonical issue intent route", () => {
  const href = buildIssueCreateHref({
    jobId: "job_123",
    prefillTitle: "Failed inspection",
    prefillDescription: "AHJ cited missing bonding bushing",
  });

  assert.match(href, /^\/jobs\/job_123\?/);
  assert.match(href, /intent=create-issue/);
  assert.match(href, /prefillSeverity=BLOCKS_WORK/);
  assert.match(href, /#job-issues$/);
});
