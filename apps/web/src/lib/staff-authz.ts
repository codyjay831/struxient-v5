import { StaffRole } from "@prisma/client";

const PERMISSION_DENIED = "You do not have permission to perform this action.";
const SETTINGS_DENIED = "You do not have permission to change organization settings.";

/** VIEWER and SUBCONTRACTOR cannot perform staff mutations. */
export function denyUnlessCanMutate(role: StaffRole): string | null {
  if (role === StaffRole.VIEWER || role === StaffRole.SUBCONTRACTOR) {
    return PERMISSION_DENIED;
  }
  return null;
}

/** Quotes, leads, customers, and commercial AI — OFFICE and above only. */
export function denyUnlessCanManageCommercial(role: StaffRole): string | null {
  if (
    role === StaffRole.VIEWER ||
    role === StaffRole.SUBCONTRACTOR ||
    role === StaffRole.FIELD
  ) {
    return PERMISSION_DENIED;
  }
  return null;
}

/** Org configuration — OWNER and ADMIN only. */
export function denyUnlessCanManageOrgSettings(role: StaffRole): string | null {
  if (role !== StaffRole.OWNER && role !== StaffRole.ADMIN) {
    return SETTINGS_DENIED;
  }
  return null;
}
