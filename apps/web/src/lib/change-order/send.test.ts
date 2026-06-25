import assert from "node:assert/strict";
import test from "node:test";
import { ChangeOrderLineOperation, ChangeOrderStatus, JobScopeItemStatus, JobTaskStatus } from "@prisma/client";
import { buildDefaultExecutionDeltaFromChangeOrderLines } from "@/lib/change-order/execution-delta-build";
import { changeOrderExecutionDeltaToJson } from "@/lib/change-order/execution-delta-schema";
import { assertChangeOrderCustomerAcceptReadyOrThrow } from "@/lib/change-order/change-order-customer-accept-readiness";
import { buildDueBeforeAddedWorkPaymentImpactJson } from "@/lib/change-order/change-order-test-fixture";

test("send review assert rejects stored unreviewed generated ADD_TASK", () => {
  const delta = buildDefaultExecutionDeltaFromChangeOrderLines({
    baseJobPlanVersion: 1,
    changeOrderId: "co-1",
    number: 1,
    priceDeltaCents: 5000,
    reasoning: "Add scope",
    lines: [
      {
        id: "line-1",
        operation: ChangeOrderLineOperation.ADD,
        sourceJobScopeItemId: null,
        description: "Battery",
        quantity: "1",
        unitPriceCents: 5000,
        priceDeltaCents: 5000,
        executionRelevant: true,
      },
    ],
    skipLegacyPaymentOperation: true,
  });

  assert.throws(
    () =>
      assertChangeOrderCustomerAcceptReadyOrThrow({
        status: ChangeOrderStatus.DRAFT,
        priceDeltaCents: 5000,
        paymentImpactJson: buildDueBeforeAddedWorkPaymentImpactJson(5000),
        executionDeltaJson: changeOrderExecutionDeltaToJson(delta),
        baseJobPlanVersion: 1,
        currentJobPlanVersion: 1,
        scopeItems: [
          {
            id: "scope-1",
            executionRelevant: true,
            status: JobScopeItemStatus.ACTIVE,
          },
        ],
        tasks: [
          {
            id: "task-1",
            status: JobTaskStatus.TODO,
            hardSignal: false,
            requiresSignals: [],
            providesSignals: [],
            jobScopeItemIds: ["scope-1"],
          },
        ],
        requireSentStatus: false,
      }),
    /CHANGE_ORDER_UNREVIEWED_GENERATED_TASKS/,
  );
});
