import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderStatus, ZeroDollarPolicyClass } from "@prisma/client";
import {
  canCustomerAcceptChangeOrder,
  canEditChangeOrderDraft,
  canStaffAcceptChangeOrder,
  shouldClearZeroDollarInternalConfirmationOnDraftEdit,
  validateZeroDollarPolicyForApply,
  validateZeroDollarPolicyForSend,
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

test("zero-dollar staff accept from DRAFT requires policy classification", () => {
  const result = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 0,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /classification/i);
});

test("INTERNAL_ADMIN blocks send but allows staff accept without confirmation", () => {
  const send = validateZeroDollarPolicyForSend({
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_ADMIN,
  });
  assert.equal(send.ok, false);

  const accept = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_ADMIN,
  });
  assert.equal(accept.ok, true);
});

test("INTERNAL_EXECUTION_ONLY requires internal confirmation before staff accept and apply", () => {
  const accept = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY,
  });
  assert.equal(accept.ok, false);
  if (!accept.ok) assert.match(accept.error, /no customer-facing change/i);

  const apply = validateZeroDollarPolicyForApply({
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY,
  });
  assert.equal(apply.ok, false);

  const confirmedAccept = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY,
    internalNoCustomerImpactConfirmedAt: new Date("2026-06-27T00:00:00.000Z"),
  });
  assert.equal(confirmedAccept.ok, true);
});

test("CUSTOMER_FACING_CHANGE allows send but blocks staff accept and apply until customer checkpoint", () => {
  const send = validateZeroDollarPolicyForSend({
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE,
  });
  assert.equal(send.ok, true);

  const accept = canStaffAcceptChangeOrder({
    status: ChangeOrderStatus.DRAFT,
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE,
  });
  assert.equal(accept.ok, false);
  if (!accept.ok) assert.match(accept.error, /customer/i);

  const apply = validateZeroDollarPolicyForApply({
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE,
    hasCustomerAcceptanceCheckpoint: false,
  });
  assert.equal(apply.ok, false);

  const acceptedApply = validateZeroDollarPolicyForApply({
    priceDeltaCents: 0,
    zeroDollarPolicyClass: ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE,
    hasCustomerAcceptanceCheckpoint: true,
  });
  assert.equal(acceptedApply.ok, true);
});

test("internal confirmation invalidates on class, content, execution, or price changes only", () => {
  const confirmedAt = new Date("2026-06-27T00:00:00.000Z");
  const base = {
    currentPriceDeltaCents: 0,
    nextPriceDeltaCents: 0,
    currentZeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY,
    nextZeroDollarPolicyClass: ZeroDollarPolicyClass.INTERNAL_EXECUTION_ONLY,
    internalNoCustomerImpactConfirmedAt: confirmedAt,
  };

  assert.equal(shouldClearZeroDollarInternalConfirmationOnDraftEdit(base), false);
  assert.equal(
    shouldClearZeroDollarInternalConfirmationOnDraftEdit({
      ...base,
      nextZeroDollarPolicyClass: ZeroDollarPolicyClass.CUSTOMER_FACING_CHANGE,
    }),
    true,
  );
  assert.equal(
    shouldClearZeroDollarInternalConfirmationOnDraftEdit({ ...base, linesChanged: true }),
    true,
  );
  assert.equal(
    shouldClearZeroDollarInternalConfirmationOnDraftEdit({
      ...base,
      executionDeltaChanged: true,
    }),
    true,
  );
  assert.equal(
    shouldClearZeroDollarInternalConfirmationOnDraftEdit({
      ...base,
      nextPriceDeltaCents: 1000,
      nextZeroDollarPolicyClass: null,
    }),
    true,
  );
  assert.equal(
    shouldClearZeroDollarInternalConfirmationOnDraftEdit({
      ...base,
      internalNoCustomerImpactConfirmedAt: null,
      linesChanged: true,
    }),
    false,
  );
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
