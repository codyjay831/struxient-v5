import {
  CustomerPortalMagicLinkPurpose,
  type Prisma,
} from "@prisma/client";
import { addMilliseconds } from "date-fns";
import { db, type ExtendedTransactionClient } from "@/lib/db";
import {
  createPublicAccessToken,
  hashPublicAccessToken,
} from "@/lib/public-access/public-token-crypto";
import { CUSTOMER_PORTAL_MAGIC_LINK_TTL_MS } from "./constants";

export type CreateMagicLinkInput = {
  customerPortalAccessId: string;
  portalIdentityId?: string | null;
  purpose: CustomerPortalMagicLinkPurpose;
  expiresAt?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  tx?: ExtendedTransactionClient;
};

export async function createCustomerPortalMagicLink(
  input: CreateMagicLinkInput,
): Promise<{ token: string; expiresAt: Date; id: string }> {
  const rawToken = createPublicAccessToken();
  const tokenHash = hashPublicAccessToken(rawToken);
  const expiresAt =
    input.expiresAt ?? addMilliseconds(new Date(), CUSTOMER_PORTAL_MAGIC_LINK_TTL_MS);

  const client = input.tx ?? db;
  const row = await client.customerPortalMagicLinkToken.create({
    data: {
      customerPortalAccessId: input.customerPortalAccessId,
      portalIdentityId: input.portalIdentityId ?? null,
      tokenHash,
      purpose: input.purpose,
      expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return { token: rawToken, expiresAt, id: row.id };
}

export type ResolvedMagicLink = {
  id: string;
  customerPortalAccessId: string;
  portalIdentityId: string | null;
  purpose: CustomerPortalMagicLinkPurpose;
};

export async function resolveCustomerPortalMagicLink(
  token: string,
  tx?: ExtendedTransactionClient,
): Promise<ResolvedMagicLink | null> {
  const tokenHash = hashPublicAccessToken(token);
  const client = tx ?? db;
  const row = await client.customerPortalMagicLinkToken.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      customerPortalAccessId: true,
      portalIdentityId: true,
      purpose: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
    },
  });
  if (!row || row.revokedAt || row.usedAt || row.expiresAt < new Date()) {
    return null;
  }
  return {
    id: row.id,
    customerPortalAccessId: row.customerPortalAccessId,
    portalIdentityId: row.portalIdentityId,
    purpose: row.purpose,
  };
}

export async function consumeCustomerPortalMagicLink(
  token: string,
  tx: ExtendedTransactionClient,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<ResolvedMagicLink> {
  const tokenHash = hashPublicAccessToken(token);
  const row = await tx.customerPortalMagicLinkToken.findFirst({
    where: { tokenHash },
  });
  if (!row || row.revokedAt || row.usedAt || row.expiresAt < new Date()) {
    throw new Error("MAGIC_LINK_INVALID");
  }

  await tx.customerPortalMagicLinkToken.update({
    where: { id: row.id },
    data: {
      usedAt: new Date(),
      ipAddress: meta?.ipAddress ?? row.ipAddress,
      userAgent: meta?.userAgent ?? row.userAgent,
    },
  });

  return {
    id: row.id,
    customerPortalAccessId: row.customerPortalAccessId,
    portalIdentityId: row.portalIdentityId,
    purpose: row.purpose,
  };
}

export async function revokeMagicLinksForAccess(
  customerPortalAccessId: string,
  tx?: ExtendedTransactionClient,
): Promise<void> {
  const client = tx ?? db;
  await client.customerPortalMagicLinkToken.updateMany({
    where: {
      customerPortalAccessId,
      usedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}

export type MagicLinkAuditMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
  metadataJson?: Prisma.InputJsonValue;
};
