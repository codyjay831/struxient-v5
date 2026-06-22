import {
  CustomerPortalEventType,
} from "@prisma/client";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import {
  activateCustomerPortalAccess,
  findOrCreatePortalIdentity,
} from "./access-service";
import { appendCustomerPortalEvent } from "./event-service";
import {
  consumeCustomerPortalMagicLink,
  resolveCustomerPortalMagicLink,
} from "./token-service";
import {
  createCustomerPortalSession,
  setCustomerPortalSessionCookie,
} from "./session-service";

export type VerifyPortalMagicLinkResult =
  | { ok: true; accessId: string }
  | { ok: false; error: string };

export async function verifyPortalMagicLinkAndStartSession(
  rawToken: string,
): Promise<VerifyPortalMagicLinkResult> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0] ?? null;
  const userAgent = headerList.get("user-agent");

  const preview = await resolveCustomerPortalMagicLink(rawToken);
  if (!preview) {
    return { ok: false, error: "This link is no longer valid." };
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const consumed = await consumeCustomerPortalMagicLink(rawToken, tx, {
        ipAddress: ip,
        userAgent,
      });

      const access = await tx.customerPortalAccess.findUnique({
        where: { id: consumed.customerPortalAccessId },
        include: {
          customerContact: { select: { email: true, phone: true } },
        },
      });
      if (!access) {
        throw new Error("ACCESS_NOT_FOUND");
      }

      let portalIdentityId = consumed.portalIdentityId ?? access.portalIdentityId;
      if (!portalIdentityId) {
        const identity = await findOrCreatePortalIdentity(
          {
            email: access.customerContact?.email,
            phone: access.customerContact?.phone,
          },
          tx,
        );
        portalIdentityId = identity.id;
        await tx.customerPortalIdentity.update({
          where: { id: identity.id },
          data: {
            emailVerifiedAt: access.customerContact?.email ? new Date() : undefined,
            phoneVerifiedAt: access.customerContact?.phone ? new Date() : undefined,
          },
        });
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
          ipAddress: ip,
          userAgent,
        },
        tx,
      );

      const session = await createCustomerPortalSession({
        portalIdentityId,
        customerPortalAccessId: access.id,
        ipAddress: ip,
        userAgent,
        tx,
      });

      return { accessId: access.id, sessionToken: session.token };
    });

    await setCustomerPortalSessionCookie(result.sessionToken);

    const access = await db.customerPortalAccess.findUnique({
      where: { id: result.accessId },
      select: {
        organizationId: true,
        customerId: true,
        jobId: true,
        portalIdentityId: true,
      },
    });
    if (access) {
      await appendCustomerPortalEvent({
        organizationId: access.organizationId,
        customerId: access.customerId,
        jobId: access.jobId,
        customerPortalAccessId: result.accessId,
        portalIdentityId: access.portalIdentityId,
        eventType: CustomerPortalEventType.PORTAL_OPENED,
        ipAddress: ip,
        userAgent,
      });
    }

    return { ok: true, accessId: result.accessId };
  } catch {
    return { ok: false, error: "This link is no longer valid." };
  }
}

export async function peekPortalMagicLink(rawToken: string) {
  const resolved = await resolveCustomerPortalMagicLink(rawToken);
  if (!resolved) return null;

  const access = await db.customerPortalAccess.findUnique({
    where: { id: resolved.customerPortalAccessId },
    select: {
      job: {
        select: {
          title: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
  if (!access) return null;
  return {
    companyName: access.job.organization.name,
    projectTitle: access.job.title,
  };
}
