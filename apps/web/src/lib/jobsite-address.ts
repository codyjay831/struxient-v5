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
  return Boolean(snap?.googlePlaceId?.trim());
}

/**
 * Returns true when a linked customer's primary service location has a Google Place ID.
 */
export function isCustomerPrimaryLocationQuoteReady(
  location: { googlePlaceId: string } | null | undefined,
): boolean {
  return Boolean(location?.googlePlaceId?.trim());
}

export type LeadAddressQuoteReadyContext = {
  /** Linked lead/quote/job service location when resolved. */
  resolvedServiceLocation?: { googlePlaceId: string } | null;
  /** Customer primary — only used when the lead has no intake jobsite line. */
  customerPrimaryLocation?: { googlePlaceId: string } | null;
};

function isGooglePlaceLocation(value: unknown): value is { googlePlaceId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "googlePlaceId" in value &&
    typeof value.googlePlaceId === "string"
  );
}

function normalizeQuoteReadyContext(
  context?: LeadAddressQuoteReadyContext | { googlePlaceId: string } | null,
): LeadAddressQuoteReadyContext {
  if (!context) {
    return {};
  }
  if (isGooglePlaceLocation(context) && !("resolvedServiceLocation" in context)) {
    return { customerPrimaryLocation: context };
  }

  const resolvedServiceLocation =
    "resolvedServiceLocation" in context &&
    isGooglePlaceLocation(context.resolvedServiceLocation)
      ? context.resolvedServiceLocation
      : null;
  const customerPrimaryLocation =
    "customerPrimaryLocation" in context &&
    isGooglePlaceLocation(context.customerPrimaryLocation)
      ? context.customerPrimaryLocation
      : null;

  return { resolvedServiceLocation, customerPrimaryLocation };
}

/**
 * Quote readiness: resolved service location or verified lead intake.
 * Customer primary does not mask a different unresolved lead jobsite.
 */
export function isLeadAddressQuoteReady(
  row: {
    address: Prisma.JsonValue | null;
    signals: Prisma.JsonValue | null;
  },
  context?: LeadAddressQuoteReadyContext | { googlePlaceId: string } | null,
): boolean {
  const ctx = normalizeQuoteReadyContext(context);

  if (isCustomerPrimaryLocationQuoteReady(ctx.resolvedServiceLocation)) {
    return true;
  }
  if (isLeadAddressVerified(row)) {
    return true;
  }
  const intakeLine = jobsiteLineFromLead(row);
  if (
    !intakeLine &&
    isCustomerPrimaryLocationQuoteReady(ctx.customerPrimaryLocation)
  ) {
    return true;
  }
  return false;
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
