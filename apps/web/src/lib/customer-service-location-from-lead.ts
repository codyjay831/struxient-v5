/**
 * Intake → customer service location carry-forward.
 *
 * Stored intake address: primarily `Lead.publicIntakeServiceLocation` (JSON snapshot).
 * Legacy/public-intake rows may only have the address embedded in `Lead.notes` under
 * "Service / project location:" — see {@link extractServiceLocationFromPublicLeadNotes}.
 *
 * `CustomerServiceLocation` rows are created from {@link attachIntakeServiceLocationToCustomerFromLead}
 * when a record is linked or a customer is created-from-intake (see lead-form-actions /
 * lead-workspace-actions). Rows are org-scoped and optionally tied to provenance via
 * `createdFromLeadId`.
 */

import type { LeadChannel, Prisma } from "@prisma/client";
import { CustomerServiceLocationSource } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import { readSignals } from "@/lib/lead/lead-projection";
import {
  buildManualPublicIntakeSnapshotFromFreeText,
  parseStoredPublicIntakeServiceLocation,
  type PublicIntakeServiceLocationV1,
} from "@/lib/public-lead-service-location";

export function normalizeAddressDedupKey(formattedAddress: string, addressLine1: string): string {
  const s = (formattedAddress || addressLine1).trim().toLowerCase();
  return s.replace(/\s+/g, " ");
}

export function addressesDedupEquivalent(a: string, b: string): boolean {
  return normalizeAddressDedupKey(a, "") === normalizeAddressDedupKey(b, "");
}

/**
 * Best-effort extraction of the public-intake "Service / project location" block from legacy
 * `Lead.notes` when `publicIntakeServiceLocation` was not stored or failed to parse.
 */
export function extractServiceLocationFromPublicLeadNotes(notes: string | null): string | null {
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

export function intakeSnapshotForCustomerFromLead(row: {
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
}): PublicIntakeServiceLocationV1 | null {
  const parsed = parseStoredPublicIntakeServiceLocation(row.address);
  if (parsed) {
    const primary = parsed.formattedAddress.trim() || parsed.addressLine1.trim();
    if (primary) {
      return parsed;
    }
  }
  const signals = readSignals(row.signals);
  const legacy = extractServiceLocationFromPublicLeadNotes(
    typeof signals.notes === "string" ? signals.notes : null,
  );
  if (!legacy) {
    return null;
  }
  return buildManualPublicIntakeSnapshotFromFreeText(legacy);
}

function serviceLocationLabelFromLeadChannel(channel: LeadChannel): string {
  return channel === "WEB_FORM" ? "From public request" : "From linked intake";
}

export type UpsertCustomerServiceLocationSnapshotParams = {
  organizationId: string;
  customerId: string | null;
  snapshot: PublicIntakeServiceLocationV1;
  /** Optional row label (e.g. intake provenance). */
  label: string | null;
  /** When set, duplicate rows may receive this provenance stamp. */
  createdFromLeadId: string | null;
};

/**
 * Creates a {@link CustomerServiceLocation} from a normalized intake-style snapshot when
 * not a duplicate (google place id or normalized formatted line). Updates provenance on
 * an existing duplicate match when {@link createdFromLeadId} is set.
 */
export async function upsertCustomerServiceLocationFromIntakeSnapshot(
  tx: ExtendedTransactionClient,
  params: UpsertCustomerServiceLocationSnapshotParams,
): Promise<{ created: boolean; skippedDuplicate: boolean; locationId: string | null }> {
  const { organizationId, customerId, snapshot, label, createdFromLeadId } = params;

  const placeId = snapshot.googlePlaceId?.trim() ?? "";
  const dedupFmt = normalizeAddressDedupKey(snapshot.formattedAddress, snapshot.addressLine1);

  const formatted =
    snapshot.formattedAddress.trim() || snapshot.addressLine1.trim() || snapshot.addressLine1;
  if (!formatted.trim()) {
    return { created: false, skippedDuplicate: false, locationId: null };
  }

  const whereCustomer = customerId != null ? { customerId } : {};
  const existing = await tx.customerServiceLocation.findMany({
    where: { organizationId, ...whereCustomer },
    select: {
      id: true,
      formattedAddress: true,
      addressLine1: true,
      googlePlaceId: true,
      createdFromLeadId: true,
      customerId: true,
    },
  });

  async function stampProvenanceOnDuplicate(dupId: string, dupCreatedFromLeadId: string | null) {
    if (createdFromLeadId != null && dupCreatedFromLeadId == null) {
      await tx.customerServiceLocation.update({
        where: { id: dupId },
        data: { createdFromLeadId },
      });
    }
  }

  if (placeId.length > 0) {
    const dup = existing.find((e) => (e.googlePlaceId ?? "").trim() === placeId);
    if (dup) {
      await stampProvenanceOnDuplicate(dup.id, dup.createdFromLeadId);
      if (customerId != null && dup.customerId == null) {
        await tx.customerServiceLocation.update({
          where: { id: dup.id },
          data: { customerId, isPrimary: true },
        });
      }
      return { created: false, skippedDuplicate: true, locationId: dup.id };
    }
  }
  if (dedupFmt.length > 0) {
    const dup = existing.find(
      (e) => normalizeAddressDedupKey(e.formattedAddress, e.addressLine1) === dedupFmt,
    );
    if (dup) {
      await stampProvenanceOnDuplicate(dup.id, dup.createdFromLeadId);
      if (customerId != null && dup.customerId == null) {
        await tx.customerServiceLocation.update({
          where: { id: dup.id },
          data: { customerId, isPrimary: true },
        });
      }
      return { created: false, skippedDuplicate: true, locationId: dup.id };
    }
  }

  const count = await tx.customerServiceLocation.count({
    where: { organizationId, ...whereCustomer },
  });
  const isPrimary = customerId != null ? count === 0 : false;

  const sourceEnum =
    snapshot.source === "google_places"
      ? CustomerServiceLocationSource.google_places
      : CustomerServiceLocationSource.manual;

  const created = await tx.customerServiceLocation.create({
    data: {
      organizationId,
      customerId,
      createdFromLeadId,
      formattedAddress: formatted,
      addressFingerprint: dedupFmt,
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

  return { created: true, skippedDuplicate: false, locationId: created.id };
}

/**
 * Persists intake-derived service location on the customer when not a duplicate.
 * Coordinates are stored for display only — not for protected decisions.
 */
export async function attachIntakeServiceLocationToCustomerFromLead(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    customerId: string;
    leadId: string;
    leadChannel: LeadChannel;
    snapshot: PublicIntakeServiceLocationV1 | null;
  },
): Promise<{ created: boolean; skippedDuplicate: boolean; locationId: string | null }> {
  const { organizationId, customerId, leadId, leadChannel, snapshot } = params;
  if (!snapshot) {
    return { created: false, skippedDuplicate: false, locationId: null };
  }

  return upsertCustomerServiceLocationFromIntakeSnapshot(tx, {
    organizationId,
    customerId,
    snapshot,
    label: serviceLocationLabelFromLeadChannel(leadChannel),
    createdFromLeadId: leadId,
  });
}

export function formatPrimaryServiceLocationLineForQuoteNotes(
  loc: { formattedAddress: string; addressLine1: string } | null,
): string | null {
  if (!loc) return null;
  const line = loc.formattedAddress.trim() || loc.addressLine1.trim();
  return line.length > 0 ? line : null;
}

export async function ensureServiceLocationForLeadFromSnapshot(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    leadId: string;
    leadChannel: LeadChannel;
    customerId: string | null;
    snapshot: PublicIntakeServiceLocationV1 | null;
  },
): Promise<string | null> {
  if (!params.snapshot) return null;
  const result = await upsertCustomerServiceLocationFromIntakeSnapshot(tx, {
    organizationId: params.organizationId,
    customerId: params.customerId,
    snapshot: params.snapshot,
    label:
      params.customerId == null
        ? "From intake"
        : serviceLocationLabelFromLeadChannel(params.leadChannel),
    createdFromLeadId: params.leadId,
  });
  return result.locationId;
}

type DbLike = Pick<ExtendedTransactionClient, "customerServiceLocation">;

/** True if this intake's address is represented on the customer (new row or deduped match). */
export async function intakeServiceLocationReflectedOnCustomerFromLead(
  db: DbLike,
  params: {
    organizationId: string;
    customerId: string;
    leadId: string;
    address: Prisma.JsonValue | null;
    signals: Prisma.JsonValue | null;
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
    address: params.address,
    signals: params.signals,
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
