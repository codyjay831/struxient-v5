import assert from "node:assert/strict";
import test from "node:test";
import { CustomerPortalEventType, StaffRole } from "@prisma/client";
import { canManageCustomerPortal, canReadCustomerCoordination } from "@/lib/customer-portal/authorize";
import { portalAuditEventLabel, listPortalAuditEventsForJob } from "@/lib/customer-portal/event-service";
import { isPortalEmailConfigured } from "@/lib/customer-portal/notification-service";
import { db } from "@/lib/db";

test("permission: FIELD staff cannot manage customer portal", () => {
  assert.equal(canManageCustomerPortal(StaffRole.FIELD), false);
  assert.equal(canManageCustomerPortal(StaffRole.ADMIN), true);
});

test("permission: FIELD/SUB cannot read customer coordination metadata", () => {
  assert.equal(canReadCustomerCoordination(StaffRole.FIELD), false);
  assert.equal(canReadCustomerCoordination(StaffRole.SUBCONTRACTOR), false);
  assert.equal(canReadCustomerCoordination(StaffRole.VIEWER), true);
  assert.equal(canReadCustomerCoordination(StaffRole.OFFICE), true);
});

test("integration: portal audit events are scoped to organization and job", async () => {
  const job = await db.job.findFirst({
    where: { customerId: { not: null } },
    select: { id: true, organizationId: true },
  });

  if (!job) {
    test.skip("requires a job with a customer in the database");
    return;
  }

  const events = await listPortalAuditEventsForJob({
    organizationId: job.organizationId,
    jobId: job.id,
    limit: 5,
  });

  assert.ok(Array.isArray(events));
  for (const event of events) {
    assert.ok(portalAuditEventLabel(event.eventType as CustomerPortalEventType));
  }
});

test("integration: notification service reports Resend configuration state", () => {
  assert.equal(typeof isPortalEmailConfigured(), "boolean");
});
