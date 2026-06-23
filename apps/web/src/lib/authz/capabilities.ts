import { StaffRole } from "@prisma/client";

export const CAPABILITIES = [
  "read.org_wide",
  "read.assignment_scoped",
  "read.commercial",
  "mutate.commercial",
  "mutate.office_work",
  "mutate.field_work",
  "mutate.subcontractor_work",
  "manage.organization_settings",
  "manage.team",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Record<StaffRole, readonly Capability[]> = {
  [StaffRole.OWNER]: CAPABILITIES,
  [StaffRole.ADMIN]: CAPABILITIES,
  [StaffRole.OFFICE]: [
    "read.org_wide",
    "read.assignment_scoped",
    "read.commercial",
    "mutate.commercial",
    "mutate.office_work",
    "mutate.field_work",
  ],
  [StaffRole.FIELD]: ["read.assignment_scoped", "mutate.field_work"],
  [StaffRole.VIEWER]: ["read.org_wide", "read.commercial"],
  [StaffRole.SUBCONTRACTOR]: ["read.assignment_scoped", "mutate.subcontractor_work"],
};

export function hasCapability(role: StaffRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function canMutate(role: StaffRole): boolean {
  return (
    hasCapability(role, "mutate.commercial") ||
    hasCapability(role, "mutate.office_work") ||
    hasCapability(role, "mutate.field_work")
  );
}

export function canReadCommercial(role: StaffRole): boolean {
  return hasCapability(role, "read.commercial");
}

export function canManageOrganizationSettings(role: StaffRole): boolean {
  return hasCapability(role, "manage.organization_settings");
}

export function canManageTeam(role: StaffRole): boolean {
  return hasCapability(role, "manage.team");
}
