import assert from "node:assert/strict";
import test from "node:test";
import { classifyLeadWorkstationAttention } from "./workstation-lead-attention";

test("missing access elevates scheduled visit attention", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "SALES_VISIT_SCHEDULED",
    hasPendingVisit: false,
    hasMissingAccess: true,
  });
  assert.equal(result.group, "investigate");
  assert.equal(result.priority, "high");
});

test("no-show recovery is critical attention", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "NEEDS_SALES_VISIT",
    hasPendingVisit: false,
    hasNoShowRecovery: true,
  });
  assert.equal(result.group, "investigate");
  assert.equal(result.priority, "critical");
});

test("completed visit missing follow-up is critical attention", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "SALES_VISIT_SCHEDULED",
    hasPendingVisit: false,
    hasCompletedMissingFollowUp: true,
  });
  assert.equal(result.group, "investigate");
  assert.equal(result.priority, "critical");
});
