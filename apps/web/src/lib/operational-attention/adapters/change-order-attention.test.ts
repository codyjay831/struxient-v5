import assert from "node:assert/strict";
import test from "node:test";
import {
  ChangeOrderApplicationStatus,
  ChangeOrderStatus,
} from "@prisma/client";
import type { ChangeOrderSendBlocker } from "@/lib/change-order/change-order-send-readiness";
import { mapAttentionItemToWorkstationWorkItem } from "../workstation-mapper";
import {
  buildChangeOrderOperationalAttentionItems,
  type ChangeOrderAttentionInput,
} from "./change-order-attention";

const updatedAt = new Date("2026-06-26T12:00:00.000Z");

function blocker(
  code: ChangeOrderSendBlocker["code"],
  explanation: string,
  actionLabel: string | null,
): ChangeOrderSendBlocker {
  return {
    code,
    severity: "blocker",
    title: code,
    explanation,
    actionLabel,
    actionTarget: code === "PAYMENT_IMPACT" ? "commercial" : "execution",
  };
}

function coInput(overrides: Partial<ChangeOrderAttentionInput> = {}): ChangeOrderAttentionInput {
  return {
    changeOrderId: "co-1",
    number: 7,
    title: "Add recessed lights",
    jobId: "job-1",
    jobTitle: "Kitchen remodel",
    customerLabel: "Cody Homeowner",
    status: ChangeOrderStatus.DRAFT,
    applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
    updatedAt,
    rankReason: "Needs attention.",
    rank: {
      priority: "high",
      group: "waiting",
      lens: "waiting",
      lane: "upcoming",
      withinLaneRank: 40,
    },
    ...overrides,
  };
}

test("change-order adapter maps draft ready-to-send state to current Workstation DTO", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(coInput());
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.id, "change_order_send:co-1");
  assert.equal(attention.kind, "change_order_send");
  assert.equal(attention.severity, "attention");
  assert.ok(item);
  assert.equal(item.id, "change-order-co-1");
  assert.equal(item.kind, "change-order");
  assert.equal(item.title, "CO-007 · Add recessed lights");
  assert.equal(item.status, "Change Order DRAFT");
  assert.equal(item.reason, "Needs attention.");
  assert.equal(item.nextStep, "Send Change Order to customer.");
  assert.equal(item.priority, "high");
  assert.equal(item.group, "waiting");
  assert.equal(item.lens, "waiting");
  assert.equal(item.lane, "upcoming");
  assert.equal(item.filterCategory, "quotes");
  assert.equal(item.href, "/jobs/job-1/change-orders?focus=co-1");
});

test("change-order adapter keeps send blocker reason canonical without changing Workstation reason", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(
    coInput({
      sendBlockers: [
        blocker(
          "PAYMENT_IMPACT",
          "The customer payment terms changed and must be saved before sending.",
          "Save commercial changes",
        ),
      ],
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.severity, "blocking");
  assert.equal(
    attention.reason,
    "The customer payment terms changed and must be saved before sending.",
  );
  assert.equal(attention.safeNextAction.label, "Save commercial changes");
  assert.equal(
    attention.safeNextAction.disabledReason,
    "The customer payment terms changed and must be saved before sending.",
  );
  assert.ok(item);
  assert.equal(item.reason, "Needs attention.");
  assert.equal(item.status, "Change Order DRAFT");
  assert.equal(item.nextStep, "Send Change Order to customer.");
});

test("change-order adapter represents price-only no-work-impact confirmation blocker", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(
    coInput({
      sendBlockers: [
        blocker(
          "CONFIRM_NO_WORK_IMPACT",
          "Confirm this price-only Change Order does not change the work plan.",
          "Confirm no work impact",
        ),
      ],
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "change_order_send");
  assert.equal(attention.severity, "blocking");
  assert.equal(
    attention.reason,
    "Confirm this price-only Change Order does not change the work plan.",
  );
  assert.equal(attention.safeNextAction.actionKind, "CONFIRM_NO_WORK_IMPACT");
  assert.ok(item);
  assert.equal(item.reason, "Needs attention.");
});

test("change-order adapter preserves sent waiting state from compatibility helper", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(
    coInput({
      status: ChangeOrderStatus.SENT,
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "change_order_send");
  assert.ok(item);
  assert.equal(item.status, "Change Order SENT");
  assert.equal(item.nextStep, "Await customer acceptance.");
  assert.equal(item.priority, "high");
  assert.equal(item.group, "waiting");
  assert.equal(item.lens, "waiting");
});

test("change-order adapter preserves accepted-not-applied state and runtime route", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(
    coInput({
      status: ChangeOrderStatus.ACCEPTED,
      applicationStatus: ChangeOrderApplicationStatus.NOT_APPLIED,
      rank: {
        priority: "critical",
        group: "ready",
        lens: "attention",
        lane: "critical",
        withinLaneRank: 3,
      },
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "change_order_apply");
  assert.equal(attention.severity, "critical");
  assert.ok(item);
  assert.equal(item.id, "change-order-co-1");
  assert.equal(item.status, "Change Order ACCEPTED");
  assert.equal(item.nextStep, "Apply accepted Change Order.");
  assert.equal(item.priority, "critical");
  assert.equal(item.group, "ready");
  assert.equal(item.lens, "attention");
  assert.equal(item.href, "/jobs/job-1/change-orders?focus=co-1");
});

test("change-order adapter preserves customer-requested-changes state", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(
    coInput({
      status: ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES,
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.kind, "change_order_send");
  assert.ok(item);
  assert.equal(item.status, "Customer requested CO changes");
  assert.equal(item.nextStep, "Customer requested Change Order changes — revise draft.");
  assert.equal(item.priority, "high");
  assert.equal(item.lens, "attention");
});

test("change-order adapter preserves execution-review and apply-failed labels", () => {
  const review = buildChangeOrderOperationalAttentionItems(
    coInput({
      applicationStatus: ChangeOrderApplicationStatus.NEEDS_EXECUTION_REVIEW,
    }),
  )[0];
  const failed = buildChangeOrderOperationalAttentionItems(
    coInput({
      applicationStatus: ChangeOrderApplicationStatus.APPLY_FAILED,
      applyBlockedReason: "The saved execution plan is stale; review before applying.",
    }),
  )[0];
  const reviewItem = mapAttentionItemToWorkstationWorkItem(review);
  const failedItem = mapAttentionItemToWorkstationWorkItem(failed);

  assert.equal(review.kind, "change_order_apply");
  assert.ok(reviewItem);
  assert.equal(reviewItem.status, "Change Order needs execution review");
  assert.equal(reviewItem.nextStep, "Review execution impact before applying Change Order.");
  assert.equal(reviewItem.group, "investigate");
  assert.equal(failed.kind, "change_order_apply");
  assert.equal(failed.reason, "The saved execution plan is stale; review before applying.");
  assert.ok(failedItem);
  assert.equal(failedItem.status, "Change Order apply failed");
  assert.equal(failedItem.nextStep, "Review failed Change Order apply and execution impact.");
  assert.equal(failedItem.reason, "Needs attention.");
});

test("change-order adapter preserves stale plan blocker without changing queue copy", () => {
  const [attention] = buildChangeOrderOperationalAttentionItems(
    coInput({
      sendBlockers: [
        blocker(
          "STALE_PLAN",
          "The execution impact is stale because the job plan changed.",
          "Review work impact",
        ),
      ],
    }),
  );
  const item = mapAttentionItemToWorkstationWorkItem(attention);

  assert.equal(attention.reason, "The execution impact is stale because the job plan changed.");
  assert.equal(attention.safeNextAction.actionKind, "STALE_PLAN");
  assert.ok(item);
  assert.equal(item.status, "Change Order DRAFT");
  assert.equal(item.reason, "Needs attention.");
});
