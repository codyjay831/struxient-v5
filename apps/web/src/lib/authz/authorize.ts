import type { StaffRole } from "@prisma/client";
import {
  canManageOrganizationSettings,
  canMutate,
  canReadCommercial,
  type Capability,
  hasCapability,
} from "./capabilities";

const MUTATION_DENIED = "You do not have permission to perform this action.";
const SETTINGS_DENIED = "You do not have permission to change organization settings.";

export function denyUnlessCapability(
  role: StaffRole,
  capability: Capability,
): string | null {
  if (!hasCapability(role, capability)) {
    return MUTATION_DENIED;
  }
  return null;
}

export function denyUnlessCanMutate(role: StaffRole): string | null {
  return canMutate(role) ? null : MUTATION_DENIED;
}

export function denyUnlessCanManageCommercial(role: StaffRole): string | null {
  return canReadCommercial(role) ? null : MUTATION_DENIED;
}

export function denyUnlessCanManageOrgSettings(role: StaffRole): string | null {
  return canManageOrganizationSettings(role) ? null : SETTINGS_DENIED;
}
