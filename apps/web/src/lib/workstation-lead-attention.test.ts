import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLeadWorkstationAttention,
  leadShouldAppearInBoardAttention,
} from "./workstation-lead-attention";

test("pending visit is investigate critical", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "READY_TO_QUOTE",
    hasPendingVisit: true,
  });
  assert.equal(result.group, "investigate");
  assert.equal(result.priority, "critical");
});

test("customer match conflict is investigate high", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "CUSTOMER_MATCH_NEEDS_REVIEW",
    hasPendingVisit: false,
  });
  assert.equal(result.group, "investigate");
  assert.equal(result.priority, "high");
});

test("ready to quote is ready high and appears on board attention", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "READY_TO_QUOTE",
    hasPendingVisit: false,
  });
  assert.equal(result.group, "ready");
  assert.equal(result.priority, "high");
  assert.equal(
    leadShouldAppearInBoardAttention({
      kind: "lead",
      group: result.group,
      priority: result.priority,
    }),
    true,
  );
});

test("waiting on customer stays low and off board attention", () => {
  const result = classifyLeadWorkstationAttention({
    conditionCode: "WAITING_ON_CUSTOMER",
    hasPendingVisit: false,
  });
  assert.equal(result.group, "waiting");
  assert.equal(result.priority, "low");
  assert.equal(
    leadShouldAppearInBoardAttention({
      kind: "lead",
      group: result.group,
      priority: result.priority,
    }),
    false,
  );
});
