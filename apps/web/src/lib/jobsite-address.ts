import type { Prisma } from "@prisma/client";
import { intakeSnapshotForCustomerFromLead } from "@/lib/customer-service-location-from-lead";

export type CustomerJobsiteLocationRow = {
  formattedAddress: string;
  addressLine1: string;
  isPrimary: boolean;
};

/**
 * Single display line for a customer’s saved service locations (primary wins).
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
 * Display line for where work happens from a lead row (structured field + legacy notes).
 */
export function jobsiteLineFromLeadIntake(row: {
  publicIntakeServiceLocation: Prisma.JsonValue | null;
  notes: string | null;
}): string | null {
  const snap = intakeSnapshotForCustomerFromLead(row);
  if (!snap) {
    return null;
  }
  const line = snap.formattedAddress.trim() || snap.addressLine1.trim();
  return line.length > 0 ? line : null;
}

/**
 * Prefer customer profile locations; otherwise fall back to the linked lead’s intake address.
 */
export function resolveJobsiteLineForQuoteOrJob(params: {
  customerLocations: CustomerJobsiteLocationRow[];
  leadRow: {
    publicIntakeServiceLocation: Prisma.JsonValue | null;
    notes: string | null;
  } | null;
}): string | null {
  const fromCustomer = jobsiteLineFromCustomerLocations(params.customerLocations);
  if (fromCustomer) {
    return fromCustomer;
  }
  if (params.leadRow) {
    return jobsiteLineFromLeadIntake(params.leadRow);
  }
  return null;
}
