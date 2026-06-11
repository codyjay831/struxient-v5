import assert from "node:assert/strict";
import test from "node:test";
import { JobScheduleEventKind, JobScheduleEventStatus } from "@prisma/client";
import {
  defaultCustomerVisibilityByKind,
  shouldNotifyCustomerOnEventConfirm,
} from "./notification-policy";

test("default customer visibility follows kind defaults", () => {
  assert.equal(
    defaultCustomerVisibilityByKind(JobScheduleEventKind.CUSTOMER_APPOINTMENT),
    true,
  );
  assert.equal(defaultCustomerVisibilityByKind(JobScheduleEventKind.CREW_WORK), false);
});

test("tentative events never auto-notify customers on confirm flow", () => {
  assert.equal(
    shouldNotifyCustomerOnEventConfirm({
      kind: JobScheduleEventKind.SITE_VISIT,
      status: JobScheduleEventStatus.TENTATIVE,
      notifyCustomerRequested: true,
    }),
    false,
  );
});
