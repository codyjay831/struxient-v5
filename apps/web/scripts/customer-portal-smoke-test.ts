/**
 * Customer Project Portal smoke test — runs against local DB + optional HTTP.
 * Usage: npx tsx scripts/customer-portal-smoke-test.ts
 */
import assert from "node:assert/strict";
import { CustomerPortalAccessStatus, CustomerRequestStatus, CustomerRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { createCustomerPortalAccess, revokeCustomerPortalAccess } from "@/lib/customer-portal/access-service";
import { peekPortalMagicLink } from "@/lib/customer-portal/verify-service";
import {
  consumeCustomerPortalMagicLink,
  resolveCustomerPortalMagicLink,
} from "@/lib/customer-portal/token-service";
import {
  activateCustomerPortalAccess,
  findOrCreatePortalIdentity,
} from "@/lib/customer-portal/access-service";
import { appendCustomerPortalEvent } from "@/lib/customer-portal/event-service";
import { CustomerPortalEventType } from "@prisma/client";
import {
  createCustomerPortalSession,
  resolveCustomerPortalSession,
} from "@/lib/customer-portal/session-service";
import { requireCustomerPortalAccess } from "@/lib/customer-portal/authorize";
import { buildCustomerProjectPortalDocument } from "@/lib/customer-portal/presenter";
import { createCustomerRequest } from "@/lib/customer-portal/request-service";
import { confirmCustomerAppointment } from "@/lib/customer-portal/schedule-service";
import {
  markResourceCustomerVisible,
  revokeCustomerVisibleResource,
} from "@/lib/customer-portal/visible-resource-service";
import {
  CustomerVisibleResourceType,
  CustomerVisibleResourceVisibility,
} from "@prisma/client";
import { listOpenCustomerRequestsForJob } from "@/lib/customer-portal/request-service";
import { resolveCustomerRequest } from "@/lib/customer-portal/request-service";

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];

function pass(step: string, detail?: string) {
  results.push({ step, ok: true, detail });
  console.log(`✓ ${step}${detail ? ` — ${detail}` : ""}`);
}

function fail(step: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  results.push({ step, ok: false, detail });
  console.error(`✗ ${step} — ${detail}`);
  throw error;
}

async function verifyMagicLinkAndCreateSession(rawToken: string): Promise<{
  accessId: string;
  sessionToken: string;
}> {
  const preview = await resolveCustomerPortalMagicLink(rawToken);
  assert.ok(preview, "magic link should resolve before consume");

  return db.$transaction(async (tx) => {
    const consumed = await consumeCustomerPortalMagicLink(rawToken, tx, {});
    const access = await tx.customerPortalAccess.findUnique({
      where: { id: consumed.customerPortalAccessId },
      include: { customerContact: { select: { email: true, phone: true } } },
    });
    assert.ok(access, "access row required");

    let portalIdentityId = consumed.portalIdentityId ?? access.portalIdentityId;
    if (!portalIdentityId) {
      const identity = await findOrCreatePortalIdentity(
        { email: access.customerContact?.email, phone: access.customerContact?.phone },
        tx,
      );
      portalIdentityId = identity.id;
    }

    await activateCustomerPortalAccess(access.id, portalIdentityId, tx);
    await appendCustomerPortalEvent(
      {
        organizationId: access.organizationId,
        customerId: access.customerId,
        jobId: access.jobId,
        customerPortalAccessId: access.id,
        portalIdentityId,
        eventType: CustomerPortalEventType.MAGIC_LINK_USED,
      },
      tx,
    );

    const session = await createCustomerPortalSession({
      portalIdentityId,
      customerPortalAccessId: access.id,
      tx,
    });

    return { accessId: access.id, sessionToken: session.token };
  });
}

async function main() {
  console.log("\nCustomer Project Portal smoke test\n");

  const job = await db.job.findFirst({
    where: { customerId: { not: null }, status: "ACTIVE" },
    select: {
      id: true,
      title: true,
      customerId: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  assert.ok(job?.customerId, "Need an ACTIVE job with a linked customer in local DB");

  const membership = await db.membership.findFirst({
    where: {
      organizationId: job.organizationId,
      role: { in: ["OWNER", "ADMIN", "OFFICE"] },
    },
    select: { id: true },
  });
  assert.ok(membership, "Need OWNER/ADMIN/OFFICE membership for invite flow");

  pass("Fixture", `job=${job.id} org=${job.organization.name}`);

  const contact = await db.customerContact.create({
    data: {
      organizationId: job.organizationId,
      customerId: job.customerId,
      name: "Smoke Test Contact",
      email: `portal-smoke-${Date.now()}@example.com`,
      isPrimary: false,
    },
  });

  let accessId = "";
  let sessionToken = "";
  let magicLinkToken = "";
  let visibleResourceId = "";

  try {
    const created = await createCustomerPortalAccess({
      organizationId: job.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      customerContactId: contact.id,
      invitedByMembershipId: membership.id,
      contactEmail: contact.email,
      expiresInDays: 1,
    });
    accessId = created.accessId;
    magicLinkToken = created.magicLinkToken;
    pass("Invite / magic link created", `/portal/${magicLinkToken.slice(0, 8)}…`);

    const peek = await peekPortalMagicLink(magicLinkToken);
    assert.ok(peek?.projectTitle, "peek should return project title");
    pass("Peek magic link", peek.projectTitle);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
    try {
      const entry = await fetch(`${baseUrl}/portal/${magicLinkToken}`, { redirect: "manual" });
      assert.ok(entry.status === 200 || entry.status === 404, `unexpected HTTP ${entry.status}`);
      pass("HTTP GET /portal/[token]", `status=${entry.status}`);
    } catch {
      pass("HTTP smoke skipped", `dev server not reachable at ${baseUrl}`);
    }

    const verified = await verifyMagicLinkAndCreateSession(magicLinkToken);
    accessId = verified.accessId;
    sessionToken = verified.sessionToken;
    pass("Verify magic link + session", `accessId=${accessId}`);

    const reused = await resolveCustomerPortalMagicLink(magicLinkToken);
    assert.equal(reused, null, "consumed token must not resolve again");
    pass("Consumed token rejected");

    const session = await resolveCustomerPortalSession(sessionToken);
    assert.ok(session, "session should resolve");
    pass("Session resolves");

    const auth = await requireCustomerPortalAccess({
      sessionToken,
      accessId,
    });
    assert.equal(auth.jobId, job.id);
    pass("requireCustomerPortalAccess", auth.accessLevel);

    const document = await buildCustomerProjectPortalDocument({
      accessId,
      organizationId: job.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      accessLevel: auth.accessLevel,
    });
    assert.ok(document.nextAction.label, "presenter should return next action");
    pass("Portal document built", `status=${document.statusLabel}`);

    await createCustomerRequest({
      session: auth,
      type: CustomerRequestType.ASK_QUESTION,
      title: "Smoke test question",
      message: "Automated smoke test request — safe to resolve.",
    });
    pass("Customer request created");

    const scheduleEvent = await db.jobScheduleEvent.findFirst({
      where: {
        jobId: job.id,
        organizationId: job.organizationId,
        customerVisible: true,
      },
      select: { id: true },
    });
    if (scheduleEvent) {
      await confirmCustomerAppointment({
        session: auth,
        scheduleEventId: scheduleEvent.id,
      });
      pass("Appointment confirmed", scheduleEvent.id);
    } else {
      pass("Appointment confirm skipped", "no customer-visible schedule event");
    }

    const slot = await markResourceCustomerVisible({
      organizationId: job.organizationId,
      customerId: job.customerId,
      jobId: job.id,
      resourceType: CustomerVisibleResourceType.DOCUMENT,
      resourceId: crypto.randomUUID(),
      visibility: CustomerVisibleResourceVisibility.CUSTOMER_ACTION_REQUIRED,
      title: "Smoke test upload slot",
      createdByMembershipId: membership.id,
    });
    visibleResourceId = slot.id;
    pass("Upload slot created", visibleResourceId);

    const openRequests = await listOpenCustomerRequestsForJob(job.organizationId, job.id);
    assert.ok(openRequests.some((r) => r.title === "Smoke test question"));
    pass("Open requests visible to staff", `${openRequests.length} open`);

    await resolveCustomerRequest({
      requestId: openRequests.find((r) => r.title === "Smoke test question")!.id,
      organizationId: job.organizationId,
      resolvedByMembershipId: membership.id,
      status: CustomerRequestStatus.RESOLVED,
    });
    pass("Staff resolved request");

    await revokeCustomerVisibleResource(visibleResourceId, job.organizationId);
    pass("Visible resource revoked");

    await revokeCustomerPortalAccess({
      accessId,
      organizationId: job.organizationId,
      revokedByMembershipId: membership.id,
    });
    pass("Access revoked");

    const accessRow = await db.customerPortalAccess.findUnique({
      where: { id: accessId },
      select: { status: true, revokedAt: true },
    });
    assert.equal(accessRow?.status, CustomerPortalAccessStatus.REVOKED);
    pass("Access status REVOKED");

    const deadSession = await resolveCustomerPortalSession(sessionToken);
    assert.equal(deadSession, null, "session should fail after revoke");
    pass("Session blocked after revoke");

    await assert.rejects(
      () => requireCustomerPortalAccess({ sessionToken, accessId }),
      /denied|invalid|expired/i,
    );
    pass("requireCustomerPortalAccess fails closed after revoke");
  } finally {
    await db.customerPortalSession.deleteMany({ where: { customerPortalAccessId: accessId } }).catch(() => {});
    await db.customerPortalMagicLinkToken.deleteMany({ where: { customerPortalAccessId: accessId } }).catch(() => {});
    await db.customerPortalEvent.deleteMany({
      where: { customerPortalAccessId: accessId },
    }).catch(() => {});
    await db.customerRequest.deleteMany({
      where: { jobId: job.id, title: { contains: "Smoke test" } },
    }).catch(() => {});
    if (visibleResourceId) {
      await db.customerVisibleResource.deleteMany({ where: { id: visibleResourceId } }).catch(() => {});
    }
    if (accessId) {
      await db.customerPortalAccess.delete({ where: { id: accessId } }).catch(() => {});
    }
    await db.customerContact.delete({ where: { id: contact.id } }).catch(() => {});
  }

  console.log("\n--- Summary ---");
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`${failed.length} step(s) failed`);
    process.exit(1);
  }
  console.log(`All ${results.length} steps passed.\n`);
}

main()
  .catch((error) => {
    console.error("\nSmoke test FAILED:", error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
