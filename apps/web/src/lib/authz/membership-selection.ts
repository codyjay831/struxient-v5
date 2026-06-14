import type { StaffRole } from "@prisma/client";

export type MembershipSelectionInput = {
  id: string;
  organizationId: string;
  role: StaffRole;
  createdAt: Date;
};

export function selectDeterministicMembership<T extends MembershipSelectionInput>(
  memberships: T[],
  preferredOrganizationId: string | null,
): T | null {
  if (memberships.length === 0) {
    return null;
  }

  if (preferredOrganizationId) {
    const preferred = memberships.find(
      (membership) => membership.organizationId === preferredOrganizationId,
    );
    if (preferred) {
      return preferred;
    }
  }

  if (memberships.length === 1) {
    return memberships[0];
  }

  return [...memberships].sort((a, b) => {
    if (a.createdAt.getTime() !== b.createdAt.getTime()) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return a.id.localeCompare(b.id);
  })[0];
}
