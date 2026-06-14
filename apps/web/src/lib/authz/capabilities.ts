import { StaffRole } from "@prisma/client";

export const CAPABILITIES = [
  "mutate.general",
  "read.commercial",
  "manage.organization_settings",
  "read.assignment_scoped",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<StaffRole, readonly Capability[]> = {
  [StaffRole.OWNER]: CAPABILITIES,
  [StaffRole.ADMIN]: CAPABILITIES,
  [StaffRole.OFFICE]: ["mutate.general", "read.commercial", "read.assignment_scoped"],
  [StaffRole.FIELD]: ["mutate.general", "read.assignment_scoped"],
  [StaffRole.VIEWER]: ["read.commercial"],
  [StaffRole.SUBCONTRACTOR]: ["read.assignment_scoped"],
};

export function hasCapability(role: StaffRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function canMutate(role: StaffRole): boolean {
  return hasCapability(role, "mutate.general");
}

export function canReadCommercial(role: StaffRole): boolean {
  return hasCapability(role, "read.commercial");
}

export function canManageOrganizationSettings(role: StaffRole): boolean {
  return hasCapability(role, "manage.organization_settings");
}
