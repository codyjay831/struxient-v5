import test from "node:test";
import assert from "node:assert/strict";
import { JobIssueSeverity, JobIssueType } from "@prisma/client";
import { buildJobIssueIntentHref, parseJobIssueCreateIntent } from "@/lib/job-issue-intent";

test("parseJobIssueCreateIntent returns not requested without create-issue intent", () => {
  const parsed = parseJobIssueCreateIntent({});
  assert.deepEqual(parsed, { isRequested: false });
});

test("parseJobIssueCreateIntent parses and constrains allowed values", () => {
  const parsed = parseJobIssueCreateIntent({
    intent: "create-issue",
    prefillTitle: "Failed inspection at panel",
    prefillDescription: "Inspector flagged missing bushing.",
    prefillSeverity: JobIssueSeverity.BLOCKS_WORK,
    prefillType: JobIssueType.INSPECTION_FAIL,
    prefillJobTaskId: "task_123",
    prefillJobStageId: "stage_123",
    returnTaskId: "task_123",
  });

  assert.equal(parsed.isRequested, true);
  assert.equal(parsed.prefillTitle, "Failed inspection at panel");
  assert.equal(parsed.prefillDescription, "Inspector flagged missing bushing.");
  assert.equal(parsed.prefillSeverity, JobIssueSeverity.BLOCKS_WORK);
  assert.equal(parsed.prefillType, JobIssueType.INSPECTION_FAIL);
  assert.equal(parsed.prefillJobTaskId, "task_123");
  assert.equal(parsed.prefillJobStageId, "stage_123");
  assert.equal(parsed.returnTaskId, "task_123");
});

test("parseJobIssueCreateIntent ignores unknown type/severity values", () => {
  const parsed = parseJobIssueCreateIntent({
    intent: "create-issue",
    prefillSeverity: "URGENT",
    prefillType: "FIELD_EVENT",
  });

  assert.equal(parsed.isRequested, true);
  assert.equal(parsed.prefillSeverity, undefined);
  assert.equal(parsed.prefillType, undefined);
});

test("buildJobIssueIntentHref includes task/stage intent hints", () => {
  const href = buildJobIssueIntentHref({
    jobId: "job_123",
    prefillTitle: "Field hold blocked by issue",
    prefillDescription: "Cannot complete hold due to failed inspection.",
    prefillSeverity: JobIssueSeverity.BLOCKS_WORK,
    prefillType: JobIssueType.INSPECTION_FAIL,
    prefillJobTaskId: "task_1",
    prefillJobStageId: "stage_1",
    returnTaskId: "task_1",
  });

  assert.match(href, /^\/jobs\/job_123\?/);
  assert.match(href, /intent=create-issue/);
  assert.match(href, /prefillJobTaskId=task_1/);
  assert.match(href, /prefillJobStageId=stage_1/);
  assert.match(href, /returnTaskId=task_1/);
  assert.match(href, /#job-issues$/);
});
