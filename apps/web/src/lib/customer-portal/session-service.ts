import { cookies } from "next/headers";
import { addMilliseconds } from "date-fns";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  createPublicAccessToken,
  hashPublicAccessToken,
} from "@/lib/public-access/public-token-crypto";
import {
  CUSTOMER_PORTAL_SESSION_COOKIE,
  CUSTOMER_PORTAL_SESSION_TTL_MS,
} from "./constants";

export type CustomerPortalSessionContext = {
  sessionId: string;
  portalIdentityId: string;
  customerPortalAccessId: string;
  organizationId: string;
  customerId: string;
  jobId: string;
};

export async function createCustomerPortalSession(
  input: {
    portalIdentityId: string;
    customerPortalAccessId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    tx?: ExtendedTransactionClient;
  },
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const rawToken = createPublicAccessToken();
  const tokenHash = hashPublicAccessToken(rawToken);
  const expiresAt = addMilliseconds(new Date(), CUSTOMER_PORTAL_SESSION_TTL_MS);
  const client = input.tx ?? db;

  const session = await client.customerPortalSession.create({
    data: {
      portalIdentityId: input.portalIdentityId,
      customerPortalAccessId: input.customerPortalAccessId,
      sessionTokenHash: tokenHash,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return { token: rawToken, expiresAt, sessionId: session.id };
}

export async function setCustomerPortalSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: Math.floor(CUSTOMER_PORTAL_SESSION_TTL_MS / 1000),
  });
}

export async function clearCustomerPortalSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_PORTAL_SESSION_COOKIE);
}

export async function getCustomerPortalSessionTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(CUSTOMER_PORTAL_SESSION_COOKIE)?.value;
  return value?.trim() ? value.trim() : null;
}

export async function resolveCustomerPortalSession(
  token: string,
  tx?: ExtendedTransactionClient,
): Promise<CustomerPortalSessionContext | null> {
  const tokenHash = hashPublicAccessToken(token);
  const client = tx ?? db;
  const now = new Date();

  const session = await client.customerPortalSession.findFirst({
    where: {
      sessionTokenHash: tokenHash,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: {
      customerPortalAccess: {
        select: {
          id: true,
          organizationId: true,
          customerId: true,
          jobId: true,
          status: true,
          revokedAt: true,
          expiresAt: true,
          portalIdentity: { select: { disabledAt: true } },
        },
      },
    },
  });

  if (!session) return null;

  const access = session.customerPortalAccess;
  if (
    access.status !== "ACTIVE" ||
    access.revokedAt ||
    (access.expiresAt && access.expiresAt < now) ||
    access.portalIdentity?.disabledAt
  ) {
    return null;
  }

  void client.customerPortalSession
    .update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    })
    .catch(() => undefined);

  return {
    sessionId: session.id,
    portalIdentityId: session.portalIdentityId,
    customerPortalAccessId: access.id,
    organizationId: access.organizationId,
    customerId: access.customerId,
    jobId: access.jobId,
  };
}

export async function revokeSessionsForAccess(
  customerPortalAccessId: string,
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.customerPortalSession.updateMany({
    where: {
      customerPortalAccessId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
