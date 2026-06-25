import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderStatus } from "@prisma/client";
import {
  CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES,
  CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE,
  requestChangeOrderChangesForShareToken,
  sendChangeOrderOfficeNoteForShareToken,
} from "@/lib/change-order/change-order-portal";
import {
  deriveChangeOrderCustomerPortalActions,
} from "@/lib/change-order/change-order-customer-accept-readiness";

test("portal actions: accept-ready SENT allows accept and request changes", () => {
  const actions = deriveChangeOrderCustomerPortalActions({
    status: ChangeOrderStatus.SENT,
    acceptReadiness: { canAccept: true, blockers: [] },
  });
  assert.equal(actions.canAccept, true);
  assert.equal(actions.canRequestChanges, true);
  assert.equal(actions.canSendOfficeNote, false);
});

test("portal actions: accept-blocked SENT allows office note only", () => {
  const actions = deriveChangeOrderCustomerPortalActions({
    status: ChangeOrderStatus.SENT,
    acceptReadiness: {
      canAccept: false,
      blockers: [
        {
          code: "EXECUTION_NOT_READY",
          customerMessage: "unavailable",
          staffMessage: "stale plan",
        },
      ],
    },
  });
  assert.equal(actions.canAccept, false);
  assert.equal(actions.canRequestChanges, false);
  assert.equal(actions.canSendOfficeNote, true);
});

test("formal request changes rejects accept-blocked SENT without status mutation", async () => {
  const result = await requestChangeOrderChangesForShareToken({
    shareTokenId: "missing-token",
    message: "Please update the panel location.",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "TOKEN_INVALID");
  }
});

test("office note rejects accept-ready SENT", async () => {
  const result = await sendChangeOrderOfficeNoteForShareToken({
    shareTokenId: "missing-token",
    message: "Please call me about this change order.",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "TOKEN_INVALID");
  }
});

test("portal checkpoint actions are distinct for office note vs formal request", () => {
  assert.notEqual(
    CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE,
    CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_FORMAL_REQUEST_CHANGES,
  );
  assert.equal(CHANGE_ORDER_PORTAL_CHECKPOINT_ACTION_OFFICE_NOTE, "customer_office_note");
});
