import { StaffRole } from "@prisma/client";

export const MANAGEABLE_MEMBER_ROLES = [
  StaffRole.ADMIN,
  StaffRole.OFFICE,
  StaffRole.FIELD,
  StaffRole.VIEWER,
  StaffRole.SUBCONTRACTOR,
] as const;

export type ManageableMemberRole = (typeof MANAGEABLE_MEMBER_ROLES)[number];

export function isManageableMemberRole(role: StaffRole): boolean {
  return MANAGEABLE_MEMBER_ROLES.includes(role as ManageableMemberRole);
}

export function countOwners(memberships: readonly { role: StaffRole }[]): number {
  return memberships.filter((membership) => membership.role === StaffRole.OWNER).length;
}

export type MembershipActorContext = {
  actorUserId: string;
  actorRole: StaffRole;
  ownerCount: number;
};

export type MembershipTarget = {
  membershipId: string;
  userId: string;
  role: StaffRole;
};

export function canActorChangeTargetRole(
  actor: MembershipActorContext,
  target: MembershipTarget,
  newRole: StaffRole,
): string | null {
  if (newRole === StaffRole.OWNER) {
    return "Owner role cannot be assigned here.";
  }

  if (!isManageableMemberRole(newRole)) {
    return "Select a valid team role.";
  }

  if (actor.actorRole === StaffRole.ADMIN && target.role === StaffRole.OWNER) {
    return "Admins cannot modify Owner memberships.";
  }

  if (target.role === StaffRole.OWNER && actor.ownerCount <= 1) {
    return "Cannot demote the only Owner in this organization.";
  }

  if (
    target.userId === actor.actorUserId &&
    target.role === StaffRole.OWNER &&
    actor.ownerCount <= 1
  ) {
    return "You cannot demote yourself while you are the only Owner.";
  }

  return null;
}

export function canActorRemoveTarget(
  actor: MembershipActorContext,
  target: MembershipTarget,
): string | null {
  if (actor.actorRole === StaffRole.ADMIN && target.role === StaffRole.OWNER) {
    return "Admins cannot modify Owner memberships.";
  }

  if (target.role === StaffRole.OWNER && actor.ownerCount <= 1) {
    return "Cannot remove the only Owner in this organization.";
  }

  if (
    target.userId === actor.actorUserId &&
    target.role === StaffRole.OWNER &&
    actor.ownerCount <= 1
  ) {
    return "You cannot remove yourself while you are the only Owner.";
  }

  return null;
}

export function getMembershipEditRestriction(
  actor: MembershipActorContext,
  target: MembershipTarget,
): string | null {
  if (actor.actorRole === StaffRole.ADMIN && target.role === StaffRole.OWNER) {
    return "Admins cannot modify Owner memberships.";
  }

  if (target.role === StaffRole.OWNER && actor.ownerCount <= 1) {
    return "The only Owner cannot be demoted or removed here.";
  }

  return null;
}
