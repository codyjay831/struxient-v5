"use server";

import { OrganizationInviteStatus, StaffRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyTeamInviteSent } from "@/lib/notifications";
import {
  createOrganizationInviteToken,
  hashOrganizationInviteToken,
} from "@/lib/invite-token";
import { MANAGEABLE_MEMBER_ROLES } from "@/lib/team/team-membership-rules";

const INVITE_EXPIRY_HOURS = 72;
const INVITE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const INVITE_RATE_LIMIT_MAX = 25;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export type TeamInviteActionResult =
  | { ok: true; inviteId: string; inviteToken: string; inviteUrl: string; emailed: boolean }
  | { ok: false; error: string };

export async function createOrganizationInviteAction(formData: FormData): Promise<TeamInviteActionResult> {
  const ctx = await getSettingsRequestContextOrThrow();
  const normalizedEmail = normalizeEmail(String(formData.get("email") ?? ""));
  const roleRaw = String(formData.get("role") ?? "") as StaffRole;

  if (!normalizedEmail.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  if (!MANAGEABLE_MEMBER_ROLES.includes(roleRaw as (typeof MANAGEABLE_MEMBER_ROLES)[number])) {
    return { ok: false, error: "Select a valid team role." };
  }

  const actor = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });
  if (normalizeEmail(actor?.email ?? "") === normalizedEmail) {
    return { ok: false, error: "Use role management for existing users instead of self-invite." };
  }

  const allowed = await checkRateLimit(`${ctx.organizationId}:${ctx.userId}`, {
    windowMs: INVITE_RATE_LIMIT_WINDOW_MS,
    max: INVITE_RATE_LIMIT_MAX,
    keyPrefix: "team-invite-create",
  });
  if (!allowed) {
    return { ok: false, error: "Too many invites sent recently. Try again in a few minutes." };
  }

  const existingMembership = await db.membership.findFirst({
    where: {
      organizationId: ctx.organizationId,
      user: { email: normalizedEmail },
    },
    select: { id: true },
  });
  if (existingMembership) {
    return { ok: false, error: "This user is already a member of your organization." };
  }

  const activeInvite = await db.organizationInvite.findFirst({
    where: {
      organizationId: ctx.organizationId,
      normalizedEmail,
      status: OrganizationInviteStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (activeInvite) {
    return { ok: false, error: "An active invite already exists for this email." };
  }

  await db.organizationInvite.updateMany({
    where: {
      organizationId: ctx.organizationId,
      normalizedEmail,
      status: OrganizationInviteStatus.PENDING,
      expiresAt: { lte: new Date() },
    },
    data: { status: OrganizationInviteStatus.EXPIRED },
  });

  const inviteToken = createOrganizationInviteToken();
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${inviteToken}`;
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);
  const invite = await db.organizationInvite.create({
    data: {
      organizationId: ctx.organizationId,
      normalizedEmail,
      role: roleRaw,
      tokenHash: hashOrganizationInviteToken(inviteToken),
      invitedByUserId: ctx.userId,
      expiresAt,
      lastSentAt: new Date(),
    },
    select: { id: true },
  });

  let emailed = false;
  if (process.env.RESEND_API_KEY && process.env.NEXT_PUBLIC_APP_URL) {
    await notifyTeamInviteSent({
      organizationId: ctx.organizationId,
      recipientEmail: normalizedEmail,
      organizationDisplayName: ctx.organizationName,
      inviteUrl,
      invitedRole: roleRaw,
      expiresAt,
    });
    emailed = true;
  }
  console.info("[team-invite] created", {
    organizationId: ctx.organizationId,
    inviteId: invite.id,
    invitedRole: roleRaw,
    emailed,
  });

  revalidatePath("/settings/team");
  return { ok: true, inviteId: invite.id, inviteToken, inviteUrl, emailed };
}

export async function revokeOrganizationInviteAction(inviteId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();
  const result = await db.organizationInvite.updateMany({
    where: {
      id: inviteId,
      organizationId: ctx.organizationId,
      status: OrganizationInviteStatus.PENDING,
    },
    data: {
      status: OrganizationInviteStatus.REVOKED,
      revokedAt: new Date(),
      revokedByUserId: ctx.userId,
    },
  });

  if (result.count === 0) {
    return { ok: false, error: "Invite not found or already inactive." };
  }

  console.info("[team-invite] revoked", {
    organizationId: ctx.organizationId,
    inviteId,
    revokedByUserId: ctx.userId,
  });

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function resendOrganizationInviteAction(
  inviteId: string,
): Promise<{ ok: boolean; error?: string; inviteUrl?: string; emailed?: boolean }> {
  const ctx = await getSettingsRequestContextOrThrow();

  const invite = await db.organizationInvite.findFirst({
    where: {
      id: inviteId,
      organizationId: ctx.organizationId,
      status: OrganizationInviteStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, normalizedEmail: true, role: true, expiresAt: true },
  });

  if (!invite) {
    return { ok: false, error: "Invite is not active." };
  }

  const token = createOrganizationInviteToken();
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${token}`;

  await db.organizationInvite.update({
    where: { id: invite.id },
    data: {
      tokenHash: hashOrganizationInviteToken(token),
      lastSentAt: new Date(),
    },
  });

  let emailed = false;
  if (process.env.RESEND_API_KEY && process.env.NEXT_PUBLIC_APP_URL) {
    await notifyTeamInviteSent({
      organizationId: ctx.organizationId,
      recipientEmail: invite.normalizedEmail,
      organizationDisplayName: ctx.organizationName,
      inviteUrl,
      invitedRole: invite.role,
      expiresAt: invite.expiresAt,
    });
    emailed = true;
  }

  console.info("[team-invite] resent", {
    organizationId: ctx.organizationId,
    inviteId: invite.id,
    emailed,
  });

  revalidatePath("/settings/team");
  return { ok: true, inviteUrl, emailed };
}
