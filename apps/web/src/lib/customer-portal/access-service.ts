import {
  CustomerPortalAccessLevel,
  CustomerPortalAccessStatus,
  CustomerPortalEventType,
  type Prisma,
} from "@prisma/client";
import { addDays } from "date-fns";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import { appendCustomerPortalEvent } from "./event-service";
import { normalizePortalEmail, normalizePortalPhone } from "./normalize-contact";
import {
  createCustomerPortalMagicLink,
  revokeMagicLinksForAccess,
} from "./token-service";
import { revokeSessionsForAccess } from "./session-service";

export type CreatePortalAccessInput = {
  organizationId: string;
  customerId: string;
  jobId: string;
  customerContactId?: string | null;
  accessLevel?: CustomerPortalAccessLevel;
  invitedByMembershipId: string;
  expiresInDays?: number | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  tx?: ExtendedTransactionClient;
};

export async function findOrCreatePortalIdentity(
  input: { email?: string | null; phone?: string | null },
  tx?: ExtendedTransactionClient,
): Promise<{ id: string; emailNormalized: string | null; phoneNormalized: string | null }> {
  const client = tx ?? db;
  const emailNormalized = normalizePortalEmail(input.email);
  const phoneNormalized = normalizePortalPhone(input.phone);

  if (!emailNormalized && !phoneNormalized) {
    throw new Error("PORTAL_IDENTITY_CONTACT_REQUIRED");
  }

  const existing =
    emailNormalized || phoneNormalized
      ? await client.customerPortalIdentity.findFirst({
          where: {
            OR: [
              ...(emailNormalized ? [{ emailNormalized }] : []),
              ...(phoneNormalized ? [{ phoneNormalized }] : []),
            ],
          },
        })
      : null;

  if (existing) {
    return existing;
  }

  return client.customerPortalIdentity.create({
    data: {
      emailNormalized,
      phoneNormalized,
    },
  });
}

export async function createCustomerPortalAccess(
  input: CreatePortalAccessInput,
): Promise<{ accessId: string; magicLinkToken: string; magicLinkExpiresAt: Date }> {
  const run = async (tx: ExtendedTransactionClient) => {
    const job = await tx.job.findFirst({
      where: {
        id: input.jobId,
        organizationId: input.organizationId,
        customerId: input.customerId,
      },
      select: { id: true, customerId: true },
    });
    if (!job?.customerId) {
      throw new Error("JOB_CUSTOMER_REQUIRED");
    }

    let portalIdentityId: string | null = null;
    if (input.contactEmail || input.contactPhone) {
      const identity = await findOrCreatePortalIdentity(
        { email: input.contactEmail, phone: input.contactPhone },
        tx,
      );
      portalIdentityId = identity.id;
    }

    const expiresAt =
      input.expiresInDays != null && input.expiresInDays > 0
        ? addDays(new Date(), input.expiresInDays)
        : null;

    const access = await tx.customerPortalAccess.create({
      data: {
        organizationId: input.organizationId,
        customerId: input.customerId,
        jobId: input.jobId,
        customerContactId: input.customerContactId ?? null,
        portalIdentityId,
        accessLevel: input.accessLevel ?? CustomerPortalAccessLevel.PROJECT_PARTICIPANT,
        status: CustomerPortalAccessStatus.PENDING_VERIFICATION,
        invitedByMembershipId: input.invitedByMembershipId,
        expiresAt,
      },
    });

    const magicLink = await createCustomerPortalMagicLink({
      customerPortalAccessId: access.id,
      portalIdentityId,
      purpose: "PORTAL_SIGN_IN",
      tx,
    });

    await appendCustomerPortalEvent(
      {
        organizationId: input.organizationId,
        customerId: input.customerId,
        jobId: input.jobId,
        customerPortalAccessId: access.id,
        portalIdentityId,
        eventType: CustomerPortalEventType.MAGIC_LINK_SENT,
        metadataJson: { purpose: "PORTAL_SIGN_IN" },
      },
      tx,
    );

    return {
      accessId: access.id,
      magicLinkToken: magicLink.token,
      magicLinkExpiresAt: magicLink.expiresAt,
    };
  };

  if (input.tx) {
    return run(input.tx);
  }
  return db.$transaction(run);
}

export async function activateCustomerPortalAccess(
  accessId: string,
  portalIdentityId: string,
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.customerPortalAccess.update({
    where: { id: accessId },
    data: {
      status: CustomerPortalAccessStatus.ACTIVE,
      portalIdentityId,
      lastUsedAt: new Date(),
    },
  });
  await client.customerPortalIdentity.update({
    where: { id: portalIdentityId },
    data: { lastSeenAt: new Date() },
  });
}

export async function revokeCustomerPortalAccess(
  input: {
    accessId: string;
    organizationId: string;
    revokedByMembershipId: string;
  },
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const run = async (tx: ExtendedTransactionClient) => {
    const access = await tx.customerPortalAccess.findFirst({
      where: { id: input.accessId, organizationId: input.organizationId },
    });
    if (!access) {
      throw new Error("ACCESS_NOT_FOUND");
    }

    await tx.customerPortalAccess.update({
      where: { id: access.id },
      data: {
        status: CustomerPortalAccessStatus.REVOKED,
        revokedAt: new Date(),
        revokedByMembershipId: input.revokedByMembershipId,
      },
    });

    await revokeSessionsForAccess(access.id, tx);
    await revokeMagicLinksForAccess(access.id, tx);

    await appendCustomerPortalEvent(
      {
        organizationId: access.organizationId,
        customerId: access.customerId,
        jobId: access.jobId,
        customerPortalAccessId: access.id,
        portalIdentityId: access.portalIdentityId,
        eventType: CustomerPortalEventType.ACCESS_REVOKED,
      },
      tx,
    );
  };

  if (tx) {
    return run(tx);
  }
  return db.$transaction(run);
}

export async function getActivePortalAccessById(
  accessId: string,
  organizationId?: string,
): Promise<{
  id: string;
  organizationId: string;
  customerId: string;
  jobId: string;
  status: CustomerPortalAccessStatus;
  accessLevel: CustomerPortalAccessLevel;
  expiresAt: Date | null;
  revokedAt: Date | null;
} | null> {
  const now = new Date();
  const access = await db.customerPortalAccess.findFirst({
    where: {
      id: accessId,
      ...(organizationId ? { organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      jobId: true,
      status: true,
      accessLevel: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  if (!access) return null;
  if (access.status !== CustomerPortalAccessStatus.ACTIVE || access.revokedAt) {
    return null;
  }
  if (access.expiresAt && access.expiresAt < now) {
    return null;
  }
  return access;
}

export async function listPortalAccessForJob(
  organizationId: string,
  jobId: string,
) {
  return db.customerPortalAccess.findMany({
    where: { organizationId, jobId },
    orderBy: { createdAt: "desc" },
    include: {
      customerContact: { select: { id: true, name: true, email: true, phone: true } },
      portalIdentity: {
        select: { emailNormalized: true, phoneNormalized: true, lastSeenAt: true },
      },
      portalEvents: {
        where: { eventType: CustomerPortalEventType.PORTAL_OPENED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
}

export function isPortalAccessUsable(access: {
  status: CustomerPortalAccessStatus;
  revokedAt: Date | null;
  expiresAt: Date | null;
}): boolean {
  if (access.status !== CustomerPortalAccessStatus.ACTIVE || access.revokedAt) {
    return false;
  }
  if (access.expiresAt && access.expiresAt < new Date()) {
    return false;
  }
  return true;
}
