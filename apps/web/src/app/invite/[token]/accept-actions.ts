"use server";

import { OrganizationInviteStatus } from "@prisma/client";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { hashOrganizationInviteToken } from "@/lib/invite-token";
import { signIn } from "@/auth";

export type AcceptInviteActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function acceptInviteAction(token: string, formData: FormData): Promise<AcceptInviteActionResult> {
  const inviteTokenHash = hashOrganizationInviteToken(token);
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (name.length < 2) {
    return { ok: false, error: "Name is required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const invite = await db.organizationInvite.findFirst({
    where: { tokenHash: inviteTokenHash },
    select: {
      id: true,
      organizationId: true,
      normalizedEmail: true,
      role: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.status !== OrganizationInviteStatus.PENDING) return { ok: false, error: "Invite is no longer active." };
  if (invite.expiresAt <= new Date()) return { ok: false, error: "Invite has expired." };

  const passwordHash = await hash(password, 10);

  const user = await db.$transaction(async (tx) => {
    let existing = await tx.user.findUnique({
      where: { email: invite.normalizedEmail },
      select: { id: true, email: true },
    });

    if (!existing) {
      existing = await tx.user.create({
        data: {
          email: invite.normalizedEmail,
          name,
          passwordHash,
        },
        select: { id: true, email: true },
      });
    } else {
      await tx.user.update({
        where: { id: existing.id },
        data: { name, passwordHash },
      });
    }

    await tx.membership.upsert({
      where: {
        userId_organizationId: {
          userId: existing.id,
          organizationId: invite.organizationId,
        },
      },
      create: {
        userId: existing.id,
        organizationId: invite.organizationId,
        role: invite.role,
      },
      update: {
        role: invite.role,
      },
    });

    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: {
        status: OrganizationInviteStatus.ACCEPTED,
        acceptedAt: new Date(),
        acceptedByUserId: existing.id,
      },
    });

    return existing;
  });

  await signIn("credentials", {
    email: user.email,
    password,
    redirect: false,
  });

  return { ok: true };
}
