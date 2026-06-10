import type { Prisma } from "@prisma/client";
import { intakeSnapshotForCustomerFromLead } from "@/lib/customer-service-location-from-lead";

export type CustomerJobsiteLocationRow = {
  formattedAddress: string;
  addressLine1: string;
  isPrimary: boolean;
};

/**
 * Single display line for a customer's saved service locations (primary wins).
 */
export function jobsiteLineFromCustomerLocations(
  locations: CustomerJobsiteLocationRow[],
): string | null {
  if (locations.length === 0) {
    return null;
  }
  const ordered = [...locations].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  for (const loc of ordered) {
    const line = loc.formattedAddress.trim() || loc.addressLine1.trim();
    if (line) {
      return line;
    }
  }
  return null;
}

/**
 * Display line for where work happens from a lead row (structured address JSONB
 * + legacy notes carried inside the signals JSONB).
 */
export function jobsiteLineFromLead(row: {
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
}): string | null {
  const snap = intakeSnapshotForCustomerFromLead(row);
  if (!snap) {
    return null;
  }
  const line = snap.formattedAddress.trim() || snap.addressLine1.trim();
  return line.length > 0 ? line : null;
}

/**
 * Returns true if the lead address has a Google Place ID (verified).
 */
export function isLeadAddressVerified(row: {
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
}): boolean {
  const snap = intakeSnapshotForCustomerFromLead(row);
  return Boolean(snap?.googlePlaceId);
}

/**
 * Prefer customer profile locations; otherwise fall back to the linked lead's intake address.
 */
export function resolveJobsiteLineForQuoteOrJob(params: {
  serviceLocation: { formattedAddress: string; addressLine1: string } | null;
  customerLocations: CustomerJobsiteLocationRow[];
  leadRow: {
    address: Prisma.JsonValue | null;
    signals: Prisma.JsonValue | null;
  } | null;
}): string | null {
  if (params.serviceLocation) {
    const line =
      params.serviceLocation.formattedAddress.trim() || params.serviceLocation.addressLine1.trim();
    if (line) return line;
  }
  const fromCustomer = jobsiteLineFromCustomerLocations(params.customerLocations);
  if (fromCustomer) {
    return fromCustomer;
  }
  if (params.leadRow) {
    return jobsiteLineFromLead(params.leadRow);
  }
  return null;
}
