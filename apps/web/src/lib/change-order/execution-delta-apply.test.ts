import assert from "node:assert/strict";
import test from "node:test";
import type { ExtendedTransactionClient } from "@/lib/db";
import { applyChangeOrderExecutionDeltaInTx } from "@/lib/change-order/execution-delta-apply";

test("applyChangeOrderExecutionDeltaInTx rejects legacy payment operations", async () => {
  let createCalled = false;
  const tx = {
    jobPaymentRequirement: {
      create: async () => {
        createCalled = true;
      },
    },
  } as unknown as ExtendedTransactionClient;

  await assert.rejects(
    () =>
      applyChangeOrderExecutionDeltaInTx(tx, {
        organizationId: "org-1",
        jobId: "job-1",
        changeOrderId: "co-1",
        actorUserId: "user-1",
        proposal: {
          schemaVersion: 1,
          baseJobPlanVersion: 1,
          operations: [
            {
              opId: "legacy:payment",
              type: "UPDATE_PAYMENT_REQUIREMENT",
              targetEntityType: "JobPaymentRequirement",
              payload: { amountCents: 5000, title: "Legacy payment op" },
              reason: "Legacy path should be blocked",
            },
          ],
        },
      }),
    /CHANGE_ORDER_LEGACY_PAYMENT_OPERATION_DISABLED/i,
  );

  assert.equal(createCalled, false);
});
