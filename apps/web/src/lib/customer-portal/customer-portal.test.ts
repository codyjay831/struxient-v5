import assert from "node:assert/strict";
import { createHash } from "crypto";
import { CustomerPortalAccessLevel } from "@prisma/client";
import { hashPublicAccessToken } from "@/lib/public-access/public-token-crypto";
import { accessLevelAllows } from "@/lib/customer-portal/visible-resource-service";
import { normalizePortalEmail, normalizePortalPhone } from "@/lib/customer-portal/normalize-contact";
import { isPortalAccessUsable } from "@/lib/customer-portal/access-service";
import { CustomerPortalAccessStatus } from "@prisma/client";

const sample = "abc123-portal-token-sample-value-for-tests";
const hash = hashPublicAccessToken(sample);
assert.equal(hash, createHash("sha256").update(sample).digest("hex"));
assert.notEqual(hash, sample);

assert.equal(normalizePortalEmail("  Test@Example.COM "), "test@example.com");
assert.equal(normalizePortalEmail(""), null);
assert.equal(normalizePortalPhone("(555) 123-4567"), "5551234567");
assert.equal(normalizePortalPhone("123"), null);

assert.equal(accessLevelAllows(CustomerPortalAccessLevel.VIEW_ONLY, CustomerPortalAccessLevel.BILLING_CONTACT), false);
assert.equal(accessLevelAllows(CustomerPortalAccessLevel.DECISION_MAKER, CustomerPortalAccessLevel.PROJECT_PARTICIPANT), true);
assert.equal(accessLevelAllows(CustomerPortalAccessLevel.PROJECT_PARTICIPANT, null), true);

assert.equal(
  isPortalAccessUsable({
    status: CustomerPortalAccessStatus.ACTIVE,
    revokedAt: null,
    expiresAt: null,
  }),
  true,
);
assert.equal(
  isPortalAccessUsable({
    status: CustomerPortalAccessStatus.REVOKED,
    revokedAt: new Date(),
    expiresAt: null,
  }),
  false,
);
assert.equal(
  isPortalAccessUsable({
    status: CustomerPortalAccessStatus.ACTIVE,
    revokedAt: null,
    expiresAt: new Date(Date.now() - 1000),
  }),
  false,
);

import { getCustomerProjectStatusLabel } from "@/lib/customer-portal/presenter";

assert.equal(getCustomerProjectStatusLabel("WAITING_FOR_APPROVAL"), "Waiting for your approval");
assert.equal(getCustomerProjectStatusLabel("COMPLETE"), "Complete");

import { canManageCustomerPortal } from "@/lib/customer-portal/authorize";
import { portalAuditEventLabel } from "@/lib/customer-portal/event-service";
import { CustomerPortalEventType } from "@prisma/client";

assert.equal(canManageCustomerPortal("OWNER"), true);
assert.equal(canManageCustomerPortal("OFFICE"), true);
assert.equal(canManageCustomerPortal("FIELD"), false);

assert.equal(portalAuditEventLabel(CustomerPortalEventType.MAGIC_LINK_SENT), "Link sent");
assert.equal(portalAuditEventLabel(CustomerPortalEventType.PAYMENT_LINK_OPENED), "Payment link opened");

console.log("customer-portal.test.ts passed");
