"use server";

import {
  JobCollaboratorStatus,
  OrganizationInviteStatus,
  StaffRole,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getSettingsRequestContextOrThrow } from "@/lib/auth-context";
import { db } from "@/lib/db";
import {
  canActorChangeTargetRole,
  canActorRemoveTarget,
  countOwners,
  type MembershipActorContext,
} from "@/lib/team/team-membership-rules";

export async function updateMembershipRoleAction(
  membershipId: string,
  role: StaffRole,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();

  const memberships = await db.membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, userId: true, role: true },
  });

  const target = memberships.find((membership) => membership.id === membershipId);
  if (!target) {
    return { ok: false, error: "Member not found." };
  }

  const actor: MembershipActorContext = {
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    ownerCount: countOwners(memberships),
  };

  const denied = canActorChangeTargetRole(actor, {
    membershipId: target.id,
    userId: target.userId,
    role: target.role,
  }, role);
  if (denied) {
    return { ok: false, error: denied };
  }

  if (target.role === role) {
    return { ok: true };
  }

  await db.membership.updateMany({
    where: {
      id: membershipId,
      organizationId: ctx.organizationId,
    },
    data: { role },
  });

  console.info("[team-member] role updated", {
    organizationId: ctx.organizationId,
    membershipId,
    previousRole: target.role,
    newRole: role,
    actorUserId: ctx.userId,
  });

  revalidatePath("/settings/team");
  return { ok: true };
}

export async function removeMembershipAction(membershipId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSettingsRequestContextOrThrow();

  const memberships = await db.membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, userId: true, role: true },
  });

  const target = memberships.find((membership) => membership.id === membershipId);
  if (!target) {
    return { ok: false, error: "Member not found." };
  }

  const actor: MembershipActorContext = {
    actorUserId: ctx.userId,
    actorRole: ctx.role,
    ownerCount: countOwners(memberships),
  };

  const denied = canActorRemoveTarget(actor, {
    membershipId: target.id,
    userId: target.userId,
    role: target.role,
  });
  if (denied) {
    return { ok: false, error: denied };
  }

  const user = await db.user.findUnique({
    where: { id: target.userId },
    select: { email: true },
  });

  await db.$transaction(async (tx) => {
    const now = new Date();

    await tx.crewMember.updateMany({
      where: {
        organizationId: ctx.organizationId,
        userId: target.userId,
        endsAt: null,
      },
      data: { endsAt: now },
    });

    await tx.jobCollaborator.updateMany({
      where: {
        organizationId: ctx.organizationId,
        userId: target.userId,
        status: JobCollaboratorStatus.ACTIVE,
      },
      data: {
        status: JobCollaboratorStatus.REVOKED,
        revokedAt: now,
      },
    });

    if (user?.email) {
      await tx.organizationInvite.updateMany({
        where: {
          organizationId: ctx.organizationId,
          normalizedEmail: user.email.toLowerCase(),
          status: OrganizationInviteStatus.PENDING,
        },
        data: {
          status: OrganizationInviteStatus.REVOKED,
          revokedAt: now,
          revokedByUserId: ctx.userId,
        },
      });
    }

    await tx.membership.delete({
      where: { id: membershipId },
    });
  });

  console.info("[team-member] removed", {
    organizationId: ctx.organizationId,
    membershipId,
    removedUserId: target.userId,
    actorUserId: ctx.userId,
  });

  revalidatePath("/settings/team");
  return { ok: true };
}
