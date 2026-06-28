import assert from "node:assert/strict";
import test from "node:test";
import {
  changeOrderApplyAttentionFixture,
  changeOrderSendAttentionFixture,
  paymentReviewAttentionFixture,
  quoteActivationAttentionFixture,
  redactedCommercialAttentionFixture,
  taskProofAttentionFixture,
  unreadableCommercialAttentionFixture,
} from "./test-fixtures";
import {
  mapAttentionItemToWorkstationWorkItem,
  mapAttentionItemToWorkstationWorkItemResult,
} from "./workstation-mapper";

test("mapAttentionItemToWorkstationWorkItem preserves Workstation-facing quote fields", () => {
  const item = mapAttentionItemToWorkstationWorkItem(quoteActivationAttentionFixture);

  assert.ok(item);
  assert.equal(item.id, quoteActivationAttentionFixture.id);
  assert.equal(item.kind, "quote");
  assert.equal(item.recordId, "quote-1");
  assert.equal(item.status, "Approved - ready to activate");
  assert.equal(item.reason, "Approved quote is waiting for job setup.");
  assert.equal(item.nextStep, "Activate job");
  assert.equal(item.priority, "critical");
  assert.equal(item.group, "investigate");
  assert.equal(item.lens, "attention");
  assert.equal(item.lane, "critical");
  assert.equal(item.withinLaneRank, 10);
  assert.equal(item.filterCategory, "quotes");
  assert.equal(item.href, "/quotes/quote-1/execution-review");
  assert.equal(item.parentRecordId, "customer-1");
  assert.equal(item.workflow?.nextAction?.type, "ACTIVATE_JOB");
  assert.equal(item.workflow?.nextAction?.label, "Activate job");
});

test("mapper preserves change-order routing and action-compatible copy", () => {
  const item = mapAttentionItemToWorkstationWorkItem(changeOrderApplyAttentionFixture);

  assert.ok(item);
  assert.equal(item.kind, "change-order");
  assert.equal(item.filterCategory, "quotes");
  assert.equal(item.status, "Change Order ACCEPTED");
  assert.equal(item.reason, "Accepted Change Order is waiting to be applied to the job.");
  assert.equal(item.nextStep, "Apply accepted Change Order.");
  assert.equal(item.href, "/jobs/job-1/change-orders?focus=co-2");
  assert.equal(item.parentRecordId, "job-1");
});

test("mapper preserves disabled action metadata on the source item without inventing Workstation labels", () => {
  const item = mapAttentionItemToWorkstationWorkItem(changeOrderSendAttentionFixture);

  assert.ok(item);
  assert.equal(changeOrderSendAttentionFixture.safeNextAction.disabledReason, "Confirm no work impact before sending.");
  assert.equal(item.nextStep, "Mark as price-only");
  assert.equal(item.reason, changeOrderSendAttentionFixture.reason);
});

test("mapper preserves task proof attention fields", () => {
  const item = mapAttentionItemToWorkstationWorkItem(taskProofAttentionFixture);

  assert.ok(item);
  assert.equal(item.kind, "task");
  assert.equal(item.status, "Needs proof");
  assert.equal(item.reason, "Task needs completion proof.");
  assert.equal(item.nextStep, "Complete the task.");
  assert.equal(item.dueAt?.toISOString(), "2026-06-27T23:59:59.000Z");
});

test("payment review remains attention-only and does not imply a blocked task", () => {
  const item = mapAttentionItemToWorkstationWorkItem(paymentReviewAttentionFixture);

  assert.ok(item);
  assert.equal(paymentReviewAttentionFixture.severity, "attention");
  assert.equal(item.kind, "investigate");
  assert.equal(item.filterCategory, "payments");
  assert.equal(item.isBlocked, undefined);
  assert.equal(item.reason, "Payment is due.");
  assert.equal(item.nextStep, "Record payment or waive requirement.");
});

test("unreadable attention does not map to Workstation", () => {
  const item = mapAttentionItemToWorkstationWorkItem(unreadableCommercialAttentionFixture);
  const result = mapAttentionItemToWorkstationWorkItemResult(unreadableCommercialAttentionFixture);

  assert.equal(item, null);
  assert.deepEqual(result, { ok: false, reason: "UNREADABLE" });
});

test("redacted attention omits payment value and hold labels", () => {
  const item = mapAttentionItemToWorkstationWorkItem(redactedCommercialAttentionFixture);

  assert.ok(item);
  assert.equal(item.title, "Payment hold");
  assert.equal(item.reason, "Payment hold - contact office.");
  assert.equal(item.nextStep, "Contact office.");
  assert.equal(item.valueLabel, undefined);
  assert.equal(item.paymentHoldLabel, undefined);
});

test("items missing Workstation compatibility fail safely", () => {
  const { workstationCompat: _workstationCompat, ...withoutCompat } = quoteActivationAttentionFixture;
  const result = mapAttentionItemToWorkstationWorkItemResult(withoutCompat);

  assert.deepEqual(result, { ok: false, reason: "MISSING_WORKSTATION_COMPAT" });
});

test("items missing rank fail safely", () => {
  const { rank: _rank, ...withoutRank } = quoteActivationAttentionFixture;
  const result = mapAttentionItemToWorkstationWorkItemResult(withoutRank);

  assert.deepEqual(result, { ok: false, reason: "MISSING_RANK" });
});
