import { StaffRole } from "@prisma/client";

export function canViewBusinessProfile(role: StaffRole): boolean {
  return role === StaffRole.OWNER || role === StaffRole.ADMIN || role === StaffRole.OFFICE;
}

export function canManageBusinessProfile(role: StaffRole): boolean {
  return role === StaffRole.OWNER || role === StaffRole.ADMIN;
}

export function assertCanViewBusinessProfile(role: StaffRole) {
  if (!canViewBusinessProfile(role)) {
    throw new Error("You do not have permission to view the business profile.");
  }
}

export function assertCanManageBusinessProfile(role: StaffRole) {
  if (!canManageBusinessProfile(role)) {
    throw new Error("Only Owner/Admin can update the business profile.");
  }
}

