/**
 * Intake → customer service location carry-forward.
 *
 * Stored intake address: primarily `SalesIntake.publicIntakeServiceLocation` (JSON snapshot).
 * Legacy/public-intake rows may only have the address embedded in `SalesIntake.notes` under
 * "Service / project location:" — see {@link extractServiceLocationFromPublicSalesIntakeNotes}.
 *
 * `CustomerServiceLocation` rows are created from {@link attachIntakeServiceLocationToCustomerFromSalesIntake}
 * when a record is linked or a customer is created-from-intake (see sales-form-actions /
 * sales-workspace-actions). Rows are org-scoped and optionally tied to provenance via
 * `createdFromSalesIntakeId`.
 */

import type { SalesIntakeSource, Prisma, PrismaClient } from "@prisma/client";
import { CustomerServiceLocationSource } from "@prisma/client";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  parseStoredPublicIntakeServiceLocation,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-intake-service-location";

export function normalizeAddressDedupKey(formattedAddress: string, addressLine1: string): string {
  const s = (formattedAddress || addressLine1).trim().toLowerCase();
  return s.replace(/\s+/g, " ");
}

export function addressesDedupEquivalent(a: string, b: string): boolean {
  return normalizeAddressDedupKey(a, "") === normalizeAddressDedupKey(b, "");
}

/**
 * Best-effort extraction of the public-intake "Service / project location" block from legacy
 * `SalesIntake.notes` when `publicIntakeServiceLocation` was not stored or failed to parse.
 */
export function extractServiceLocationFromPublicSalesIntakeNotes(notes: string | null): string | null {
  if (!notes?.includes("[Public Intake Form]")) {
    return null;
  }
  const normalized = notes.replace(/\r\n/g, "\n");
  const headerRe = /^Service \/ project location:\s*\n/im;
  const m = normalized.match(headerRe);
  if (!m || m.index === undefined) {
    return null;
  }
  const start = m.index + m[0].length;
  const rest = normalized.slice(start);
  const boundary = /\n\n[^\n]+:\s*\n/;
  const boundaryMatch = boundary.exec(rest);
  const slice = boundaryMatch ? rest.slice(0, boundaryMatch.index) : rest;
  const t = slice.trim();
  return t.length > 0 ? t : null;
}

export function intakeSnapshotForCustomerFromSalesIntake(row: {
  publicIntakeServiceLocation: Prisma.JsonValue | null;
  notes: string | null;
}): PublicIntakeServiceLocationV1 | null {
  const parsed = parseStoredPublicIntakeServiceLocation(row.publicIntakeServiceLocation);
  if (parsed) {
    const primary = parsed.formattedAddress.trim() || parsed.addressLine1.trim();
    if (primary) {
      return parsed;
    }
  }
  const legacy = extractServiceLocationFromPublicSalesIntakeNotes(row.notes);
  if (!legacy) {
    return null;
  }
  return buildManualPublicIntakeSnapshotFromFreeText(legacy);
}

function serviceLocationLabelFromSalesIntakeSource(source: SalesIntakeSource): string {
  return source === "PUBLIC_REQUEST_LINK" ? "From public request" : "From linked intake";
}

export type UpsertCustomerServiceLocationSnapshotParams = {
  organizationId: string;
  customerId: string;
  snapshot: PublicIntakeServiceLocationV1;
  /** Optional row label (e.g. intake provenance). */
  label: string | null;
  /** When set, duplicate rows may receive this provenance stamp. */
  createdFromSalesIntakeId: string | null;
};

/**
 * Creates a {@link CustomerServiceLocation} from a normalized intake-style snapshot when
 * not a duplicate (google place id or normalized formatted line). Updates provenance on
 * an existing duplicate match when {@link createdFromSalesIntakeId} is set.
 */
export async function upsertCustomerServiceLocationFromIntakeSnapshot(
  tx: Prisma.TransactionClient,
  params: UpsertCustomerServiceLocationSnapshotParams,
): Promise<{ created: boolean; skippedDuplicate: boolean }> {
  const { organizationId, customerId, snapshot, label, createdFromSalesIntakeId } = params;

  const placeId = snapshot.googlePlaceId?.trim() ?? "";
  const dedupFmt = normalizeAddressDedupKey(snapshot.formattedAddress, snapshot.addressLine1);

  const formatted =
    snapshot.formattedAddress.trim() || snapshot.addressLine1.trim() || snapshot.addressLine1;
  if (!formatted.trim()) {
    return { created: false, skippedDuplicate: false };
  }

  const existing = await tx.customerServiceLocation.findMany({
    where: { organizationId, customerId },
    select: { id: true, formattedAddress: true, googlePlaceId: true, createdFromSalesIntakeId: true },
  });

  async function stampProvenanceOnDuplicate(dupId: string, dupCreatedFromSalesIntakeId: string | null) {
    if (createdFromSalesIntakeId != null && dupCreatedFromSalesIntakeId == null) {
      await tx.customerServiceLocation.update({
        where: { id: dupId },
        data: { createdFromSalesIntakeId },
      });
    }
  }

  if (placeId.length > 0) {
    const dup = existing.find((e) => (e.googlePlaceId ?? "").trim() === placeId);
    if (dup) {
      await stampProvenanceOnDuplicate(dup.id, dup.createdFromSalesIntakeId);
      return { created: false, skippedDuplicate: true };
    }
  }
  if (dedupFmt.length > 0) {
    const dup = existing.find(
      (e) => normalizeAddressDedupKey(e.formattedAddress, "") === dedupFmt,
    );
    if (dup) {
      await stampProvenanceOnDuplicate(dup.id, dup.createdFromSalesIntakeId);
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

  await tx.customerServiceLocation.create({
    data: {
      organizationId,
      customerId,
      createdFromSalesIntakeId,
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
      label,
      isPrimary,
    },
  });

  return { created: true, skippedDuplicate: false };
}

/**
 * Persists intake-derived service location on the customer when not a duplicate.
 * Coordinates are stored for display only — not for protected decisions.
 */
export async function attachIntakeServiceLocationToCustomerFromSalesIntake(
  tx: Prisma.TransactionClient,
  params: {
    organizationId: string;
    customerId: string;
    salesIntakeId: string;
    salesIntakeSource: SalesIntakeSource;
    snapshot: PublicIntakeServiceLocationV1 | null;
  },
): Promise<{ created: boolean; skippedDuplicate: boolean }> {
  const { organizationId, customerId, salesIntakeId, salesIntakeSource, snapshot } = params;
  if (!snapshot) {
    return { created: false, skippedDuplicate: false };
  }

  return upsertCustomerServiceLocationFromIntakeSnapshot(tx, {
    organizationId,
    customerId,
    snapshot,
    label: serviceLocationLabelFromSalesIntakeSource(salesIntakeSource),
    createdFromSalesIntakeId: salesIntakeId,
  });
}

export function formatPrimaryServiceLocationLineForQuoteNotes(
  loc: { formattedAddress: string; addressLine1: string } | null,
): string | null {
  if (!loc) return null;
  const line = loc.formattedAddress.trim() || loc.addressLine1.trim();
  return line.length > 0 ? line : null;
}

type DbLike = Pick<PrismaClient, "customerServiceLocation">;

/** True if this intake's address is represented on the customer (new row or deduped match). */
export async function intakeServiceLocationReflectedOnCustomerFromSalesIntake(
  db: DbLike,
  params: {
    organizationId: string;
    customerId: string;
    salesIntakeId: string;
    publicIntakeServiceLocation: Prisma.JsonValue | null;
    notes: string | null;
  },
): Promise<boolean> {
  const linked = await db.customerServiceLocation.count({
    where: {
      organizationId: params.organizationId,
      customerId: params.customerId,
      createdFromSalesIntakeId: params.salesIntakeId,
    },
  });
  if (linked > 0) {
    return true;
  }
  const snap = intakeSnapshotForCustomerFromSalesIntake({
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
