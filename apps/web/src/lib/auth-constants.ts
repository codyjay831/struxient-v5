import { StaffRole } from "@prisma/client";

/**
 * Core capability checks for staff roles.
 * This is a foundation for server-side authorization.
 */
export const STAFF_CAPABILITIES = {
  [StaffRole.OWNER]: ["*"],
  [StaffRole.ADMIN]: ["*"],
  [StaffRole.OFFICE]: [
    "view_all",
    "manage_sales_intakes",
    "manage_quotes",
    "manage_customers",
    "record_payments",
  ],
  [StaffRole.FIELD]: ["view_assigned", "update_assigned_tasks", "upload_files"],
  [StaffRole.VIEWER]: ["view_all"],
  [StaffRole.SUBCONTRACTOR]: ["view_job_scoped"],
} as const;

export type StaffCapability =
  | (typeof STAFF_CAPABILITIES)[keyof typeof STAFF_CAPABILITIES][number]
  | "*";

export function hasCapability(role: StaffRole, capability: StaffCapability): boolean {
  const allowed = STAFF_CAPABILITIES[role] as readonly string[];
  if (allowed.includes("*")) return true;
  return allowed.includes(capability);
}
