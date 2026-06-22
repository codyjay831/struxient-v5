import type { StaffRole } from "@prisma/client";
import { denyUnlessCanManageCommercial, denyUnlessCanMutate } from "@/lib/staff-authz";

export function denyUnlessCanSendQuoteSignature(role: StaffRole): string | null {
  return denyUnlessCanMutate(role);
}

export function denyUnlessCanResendQuoteSignature(role: StaffRole): string | null {
  return denyUnlessCanMutate(role);
}

export function denyUnlessCanRevokeQuoteSignature(role: StaffRole): string | null {
  return denyUnlessCanMutate(role);
}

export function denyUnlessCanCopySignerLink(role: StaffRole): string | null {
  return denyUnlessCanMutate(role);
}

export function denyUnlessCanViewSignatureAudit(role: StaffRole): string | null {
  return denyUnlessCanManageCommercial(role);
}

export function canViewSignatureRawAuditFields(role: StaffRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function denyUnlessCanManuallyDeliverSignerLink(role: StaffRole): string | null {
  return denyUnlessCanMutate(role);
}
