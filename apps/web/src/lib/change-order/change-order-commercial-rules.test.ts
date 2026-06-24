import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderStatus } from "@prisma/client";
import {
  canCustomerAcceptChangeOrder,
  canEditChangeOrderDraft,
  canStaffAcceptChangeOrder,
} from "./change-order-commercial-rules";

test("price-impact staff accept from DRAFT is rejected", () => {
  const result = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 50000,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /sent to the customer/i);
  }
});

test("price-impact staff accept from SENT is allowed", () => {
  const result = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.SENT,
    priceDeltaCents: 50000,
  });
  assert.equal(result.ok, true);
});

test("zero-dollar staff accept from DRAFT is allowed", () => {
  const result = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 0,
  });
  assert.equal(result.ok, true);
});

test("duplicate staff accept is rejected", () => {
  const result = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.ACCEPTED,
    priceDeltaCents: 0,
  });
  assert.equal(result.ok, false);
});

test("customer accept from SENT is allowed", () => {
  assert.equal(canCustomerAcceptChangeOrder(ChangeOrderStatus.SENT).ok, true);
});

test("customer accept when already accepted is idempotent-safe", () => {
  const result = canCustomerAcceptChangeOrder(ChangeOrderStatus.ACCEPTED);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "ALREADY_ACCEPTED");
});

test("draft update allowed for DRAFT and CUSTOMER_REQUESTED_CHANGES only", () => {
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.DRAFT).ok, true);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.CUSTOMER_REQUESTED_CHANGES).ok, true);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.SENT).ok, false);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.ACCEPTED).ok, false);
  assert.equal(canEditChangeOrderDraft(ChangeOrderStatus.APPLIED).ok, false);
});
