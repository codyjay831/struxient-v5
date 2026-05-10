import type { Prisma, PrismaClient } from "@prisma/client";
import { CustomerServiceLocationSource } from "@prisma/client";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  parseStoredPublicIntakeServiceLocation,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";

function normalizeAddressDedupKey(formattedAddress: string, addressLine1: string): string {
  const s = (formattedAddress || addressLine1).trim().toLowerCase();
  return s.replace(/\s+/g, " ");
}

export function addressesDedupEquivalent(a: string, b: string): boolean {
  return normalizeAddressDedupKey(a, "") === normalizeAddressDedupKey(b, "");
}

/**
 * Best-effort extraction of the public-intake "Service / project location" block from legacy
 * `Lead.notes` when `publicIntakeServiceLocation` was not stored.
 */
export function extractServiceLocationFromPublicLeadNotes(notes: string | null): string | null {
  if (!notes?.includes("[Public Intake Form]")) {
    return null;
  }
  const marker = "Service / project location:\n";
  const i = notes.indexOf(marker);
  if (i === -1) {
    return null;
  }
  const start = i + marker.length;
  const end = notes.indexOf("\n\nPreferred timing:", start);
  const slice = end === -1 ? notes.slice(start) : notes.slice(start, end);
  const t = slice.trim();
  return t.length > 0 ? t : null;
}

export function intakeSnapshotForCustomerFromLead(row: {
  publicIntakeServiceLocation: Prisma.JsonValue | null;
  notes: string | null;
}): PublicIntakeServiceLocationV1 | null {
  const parsed = parseStoredPublicIntakeServiceLocation(row.publicIntakeServiceLocation);
  if (parsed) {
    return parsed;
  }
  const legacy = extractServiceLocationFromPublicLeadNotes(row.notes);
  if (!legacy) {
    return null;
  }
  return buildManualPublicIntakeSnapshotFromFreeText(legacy);
}

/**
 * Persists intake-derived service location on the customer when not a duplicate.
 * Coordinates are stored for display only — not for protected decisions.
 */
export async function attachIntakeServiceLocationToCustomer(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    customerId: string;
    leadId: string;
    snapshot: PublicIntakeServiceLocationV1 | null;
  },
): Promise<{ created: boolean; skippedDuplicate: boolean }> {
  const { organizationId, customerId, leadId, snapshot } = params;
  if (!snapshot) {
    return { created: false, skippedDuplicate: false };
  }

  const placeId = snapshot.googlePlaceId?.trim() ?? "";
  const dedupFmt = normalizeAddressDedupKey(snapshot.formattedAddress, snapshot.addressLine1);

  const existing = await tx.customerServiceLocation.findMany({
    where: { organizationId, customerId },
    select: { id: true, formattedAddress: true, googlePlaceId: true, createdFromLeadId: true },
  });

  async function stampProvenanceOnDuplicate(dupId: string, dupCreatedFromLeadId: string | null) {
    if (dupCreatedFromLeadId == null) {
      await tx.customerServiceLocation.update({
        where: { id: dupId },
        data: { createdFromLeadId: leadId },
      });
    }
  }

  if (placeId.length > 0) {
    const dup = existing.find((e) => (e.googlePlaceId ?? "").trim() === placeId);
    if (dup) {
      await stampProvenanceOnDuplicate(dup.id, dup.createdFromLeadId);
      return { created: false, skippedDuplicate: true };
    }
  }
  if (dedupFmt.length > 0) {
    const dup = existing.find(
      (e) => normalizeAddressDedupKey(e.formattedAddress, "") === dedupFmt,
    );
    if (dup) {
      await stampProvenanceOnDuplicate(dup.id, dup.createdFromLeadId);
      return { created: false, skippedDuplicate: true };
    }
  }

  const count = await tx.customerServiceLocation.count({
    where: { organizationId, customerId },
  });
  const isPrimary = count === 0;

  const sourceEnum =
    snapshot.source === "google_places"
      ? CustomerServiceLocationSource.google_places
      : CustomerServiceLocationSource.manual;

  const formatted =
    snapshot.formattedAddress.trim() || snapshot.addressLine1.trim() || snapshot.addressLine1;

  await tx.customerServiceLocation.create({
    data: {
      organizationId,
      customerId,
      createdFromLeadId: leadId,
      formattedAddress: formatted,
      addressLine1: snapshot.addressLine1.trim() || formatted,
      addressLine2: snapshot.addressLine2 ?? "",
      city: snapshot.city ?? "",
      state: snapshot.state ?? "",
      postalCode: snapshot.postalCode ?? "",
      country: snapshot.country ?? "",
      googlePlaceId: placeId,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      source: sourceEnum,
      label: "Intake",
      isPrimary,
    },
  });

  return { created: true, skippedDuplicate: false };
}

export function formatPrimaryServiceLocationLineForQuoteNotes(
  loc: { formattedAddress: string; addressLine1: string } | null,
): string | null {
  if (!loc) return null;
  const line = loc.formattedAddress.trim() || loc.addressLine1.trim();
  return line.length > 0 ? line : null;
}

type DbLike = Pick<PrismaClient, "customerServiceLocation">;

/** True if this lead's intake address is represented on the customer (new row or deduped match). */
export async function intakeServiceLocationReflectedOnCustomer(
  db: DbLike,
  params: {
    organizationId: string;
    customerId: string;
    leadId: string;
    publicIntakeServiceLocation: Prisma.JsonValue | null;
    notes: string | null;
  },
): Promise<boolean> {
  const linked = await db.customerServiceLocation.count({
    where: {
      organizationId: params.organizationId,
      customerId: params.customerId,
      createdFromLeadId: params.leadId,
    },
  });
  if (linked > 0) {
    return true;
  }
  const snap = intakeSnapshotForCustomerFromLead({
    publicIntakeServiceLocation: params.publicIntakeServiceLocation,
    notes: params.notes,
  });
  const primary = snap?.formattedAddress.trim() || snap?.addressLine1.trim();
  if (!primary) {
    return false;
  }
  const locs = await db.customerServiceLocation.findMany({
    where: { organizationId: params.organizationId, customerId: params.customerId },
    select: { formattedAddress: true },
  });
  return locs.some((l) => addressesDedupEquivalent(l.formattedAddress, primary));
}
