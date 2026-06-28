import { BetaSignupInviteStatus } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildBetaSignupUrl,
  getBetaInviteExpiryDays,
  getDefaultBetaAiUnits,
  getDefaultBetaDays,
} from "@/lib/beta/beta-config";
import {
  createBetaSignupInviteToken,
  hashBetaSignupInviteToken,
} from "@/lib/invite-token";
import { appendPlatformAuditEvent } from "./platform-audit";
import { normalizePageQuery, toPageResult } from "./platform-pagination";
import type { PlatformContext, PlatformPageQuery, PlatformPageResult } from "./platform-types";

export type PlatformBetaInviteListItem = {
  id: string;
  normalizedEmail: string;
  status: BetaSignupInviteStatus;
  betaDays: number;
  aiEnabled: boolean;
  aiIncludedUnits: number;
  expiresAt: Date;
  acceptedAt: Date | null;
  organizationId: string | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdByEmail: string | null;
};

export type PlatformBetaGrantListItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  startsAt: Date;
  expiresAt: Date;
  aiEnabled: boolean;
  aiIncludedUnits: number;
  usedAiUnits: number;
  revokedAt: Date | null;
  createdAt: Date;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function listPlatformBetaInvites(
  _ctx: PlatformContext,
  query: PlatformPageQuery,
): Promise<PlatformPageResult<PlatformBetaInviteListItem>> {
  const { page, pageSize } = normalizePageQuery(query);

  const [totalCount, invites] = await Promise.all([
    db.betaSignupInvite.count(),
    db.betaSignupInvite.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        normalizedEmail: true,
        status: true,
        betaDays: true,
        aiEnabled: true,
        aiIncludedUnits: true,
        expiresAt: true,
        acceptedAt: true,
        organizationId: true,
        revokedAt: true,
        createdAt: true,
        createdBy: { select: { email: true } },
      },
    }),
  ]);

  const items: PlatformBetaInviteListItem[] = invites.map((invite) => ({
    id: invite.id,
    normalizedEmail: invite.normalizedEmail,
    status: invite.status,
    betaDays: invite.betaDays,
    aiEnabled: invite.aiEnabled,
    aiIncludedUnits: invite.aiIncludedUnits,
    expiresAt: invite.expiresAt,
    acceptedAt: invite.acceptedAt,
    organizationId: invite.organizationId,
    revokedAt: invite.revokedAt,
    createdAt: invite.createdAt,
    createdByEmail: invite.createdBy.email,
  }));

  return toPageResult(items, totalCount, page, pageSize);
}

export async function listPlatformBetaGrants(
  _ctx: PlatformContext,
  query: PlatformPageQuery,
): Promise<PlatformPageResult<PlatformBetaGrantListItem>> {
  const { page, pageSize } = normalizePageQuery(query);

  const [totalCount, grants] = await Promise.all([
    db.organizationBetaGrant.count(),
    db.organizationBetaGrant.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        organizationId: true,
        startsAt: true,
        expiresAt: true,
        aiEnabled: true,
        aiIncludedUnits: true,
        usedAiUnits: true,
        revokedAt: true,
        createdAt: true,
        organization: { select: { name: true } },
      },
    }),
  ]);

  const items: PlatformBetaGrantListItem[] = grants.map((grant) => ({
    id: grant.id,
    organizationId: grant.organizationId,
    organizationName: grant.organization.name,
    startsAt: grant.startsAt,
    expiresAt: grant.expiresAt,
    aiEnabled: grant.aiEnabled,
    aiIncludedUnits: grant.aiIncludedUnits,
    usedAiUnits: grant.usedAiUnits,
    revokedAt: grant.revokedAt,
    createdAt: grant.createdAt,
  }));

  return toPageResult(items, totalCount, page, pageSize);
}

export async function createPlatformBetaInvite(
  ctx: PlatformContext,
  input: {
    email: string;
    betaDays?: number;
    aiEnabled?: boolean;
    aiIncludedUnits?: number;
    reason: string;
  },
): Promise<{ inviteId: string; inviteUrl?: string }> {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  const betaDays = input.betaDays ?? getDefaultBetaDays();
  const aiEnabled = input.aiEnabled ?? false;
  const aiIncludedUnits = input.aiIncludedUnits ?? getDefaultBetaAiUnits();

  if (betaDays <= 0) throw new Error("Beta days must be greater than zero.");
  if (aiIncludedUnits < 0) throw new Error("AI units cannot be negative.");

  const existingPending = await db.betaSignupInvite.findFirst({
    where: {
      normalizedEmail,
      status: BetaSignupInviteStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (existingPending) {
    throw new Error("An active beta invite already exists for this email.");
  }

  const inviteToken = createBetaSignupInviteToken();
  const expiresAt = new Date(Date.now() + getBetaInviteExpiryDays() * 24 * 60 * 60 * 1000);

  const invite = await db.$transaction(async (tx) => {
    const created = await tx.betaSignupInvite.create({
      data: {
        normalizedEmail,
        tokenHash: hashBetaSignupInviteToken(inviteToken),
        betaDays,
        aiEnabled,
        aiIncludedUnits,
        expiresAt,
        createdByUserId: ctx.userId,
      },
      select: { id: true },
    });

    await appendPlatformAuditEvent(
      ctx,
      {
        action: "platform.beta.invite.created",
        targetType: "beta_signup_invite",
        targetId: created.id,
        reason: input.reason,
        outcome: "SUCCESS",
        metadata: {
          inviteeEmail: normalizedEmail,
          betaDays,
          aiEnabled,
          aiIncludedUnits,
          method: "platform_ui",
        },
      },
      tx,
    );

    return created;
  });

  return {
    inviteId: invite.id,
    inviteUrl: process.env.NODE_ENV !== "production" ? buildBetaSignupUrl(inviteToken) : undefined,
  };
}

export async function revokePlatformBetaInvite(
  ctx: PlatformContext,
  inviteId: string,
  reason: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const invite = await tx.betaSignupInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, status: true, normalizedEmail: true },
    });
    if (!invite) throw new Error("Beta invite not found.");
    if (invite.status !== BetaSignupInviteStatus.PENDING) {
      throw new Error("Only pending beta invites can be revoked.");
    }

    await tx.betaSignupInvite.update({
      where: { id: invite.id },
      data: {
        status: BetaSignupInviteStatus.REVOKED,
        revokedAt: new Date(),
        revokedByUserId: ctx.userId,
      },
    });

    await appendPlatformAuditEvent(
      ctx,
      {
        action: "platform.beta.invite.revoked",
        targetType: "beta_signup_invite",
        targetId: invite.id,
        reason,
        outcome: "SUCCESS",
        metadata: {
          inviteeEmail: invite.normalizedEmail,
          method: "platform_ui",
        },
      },
      tx,
    );
  });
}

export async function revokePlatformBetaGrant(
  ctx: PlatformContext,
  grantId: string,
  reason: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const grant = await tx.organizationBetaGrant.findUnique({
      where: { id: grantId },
      select: { id: true, organizationId: true, revokedAt: true },
    });
    if (!grant) throw new Error("Beta grant not found.");
    if (grant.revokedAt) throw new Error("Beta grant is already revoked.");

    await tx.organizationBetaGrant.update({
      where: { id: grant.id },
      data: {
        revokedAt: new Date(),
        revokedByUserId: ctx.userId,
      },
    });

    await appendPlatformAuditEvent(
      ctx,
      {
        action: "platform.beta.grant.revoked",
        targetType: "organization_beta_grant",
        targetId: grant.id,
        organizationId: grant.organizationId,
        reason,
        outcome: "SUCCESS",
        metadata: {
          method: "platform_ui",
        },
      },
      tx,
    );
  });
}
