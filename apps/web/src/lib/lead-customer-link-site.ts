import type { LeadChannel } from "@prisma/client";
import type { ExtendedTransactionClient } from "@/lib/db";
import {
  attachIntakeServiceLocationToCustomerFromLead,
  intakeSnapshotForCustomerFromLead,
  normalizeAddressDedupKey,
} from "@/lib/customer-service-location-from-lead";
import type { PublicIntakeServiceLocationV1 } from "@/lib/public-lead-service-location";
import type { Prisma } from "@prisma/client";

export type CustomerServiceLocationRef = {
  id: string;
  formattedAddress: string;
  addressLine1: string;
  googlePlaceId?: string | null;
  isPrimary: boolean;
};

export type LeadCustomerLinkSiteOutcome =
  | { kind: "no-address"; intakeDisplayLine: null }
  | {
      kind: "existing-site";
      serviceLocationId: string;
      displayLine: string;
      matchedLocation: CustomerServiceLocationRef;
    }
  | { kind: "add-new-site"; intakeDisplayLine: string };

export function intakeDisplayLineFromSnapshot(
  snapshot: PublicIntakeServiceLocationV1 | null,
): string | null {
  if (!snapshot) return null;
  const line = snapshot.formattedAddress.trim() || snapshot.addressLine1.trim();
  return line.length > 0 ? line : null;
}

/**
 * Classifies how a lead intake address relates to a candidate customer's saved sites.
 * Pure helper — callers must pass org-scoped customer locations only.
 */
export function classifyLeadIntakeAgainstCustomerSites(
  snapshot: PublicIntakeServiceLocationV1 | null,
  customerLocations: CustomerServiceLocationRef[],
): LeadCustomerLinkSiteOutcome {
  const intakeLine = intakeDisplayLineFromSnapshot(snapshot);
  if (!intakeLine) {
    return { kind: "no-address", intakeDisplayLine: null };
  }

  const placeId = snapshot?.googlePlaceId?.trim() ?? "";
  if (placeId.length > 0) {
    const byPlace = customerLocations.find((loc) => (loc.googlePlaceId ?? "").trim() === placeId);
    if (byPlace) {
      const displayLine = byPlace.formattedAddress.trim() || byPlace.addressLine1.trim() || intakeLine;
      return {
        kind: "existing-site",
        serviceLocationId: byPlace.id,
        displayLine,
        matchedLocation: byPlace,
      };
    }
  }

  const dedupKey = normalizeAddressDedupKey(snapshot!.formattedAddress, snapshot!.addressLine1);
  if (dedupKey.length > 0) {
    const byFmt = customerLocations.find(
      (loc) => normalizeAddressDedupKey(loc.formattedAddress, loc.addressLine1) === dedupKey,
    );
    if (byFmt) {
      const displayLine = byFmt.formattedAddress.trim() || byFmt.addressLine1.trim() || intakeLine;
      return {
        kind: "existing-site",
        serviceLocationId: byFmt.id,
        displayLine,
        matchedLocation: byFmt,
      };
    }
  }

  return { kind: "add-new-site", intakeDisplayLine: intakeLine };
}

/** Short confirmation copy for link UI. */
export function describeLeadCustomerLinkSiteOutcome(outcome: LeadCustomerLinkSiteOutcome): string {
  switch (outcome.kind) {
    case "no-address":
      return "No service address on this request yet. The customer will be linked without a jobsite.";
    case "existing-site":
      return `Use existing jobsite: ${outcome.displayLine}`;
    case "add-new-site":
      return `Add new service address to this customer: ${outcome.intakeDisplayLine}`;
  }
}

export function intakeSnapshotFromLeadRow(row: {
  address: Prisma.JsonValue | null;
  signals: Prisma.JsonValue | null;
}): PublicIntakeServiceLocationV1 | null {
  return intakeSnapshotForCustomerFromLead(row);
}

/**
 * Resolves the service location for a lead→customer link and attaches intake when needed.
 * Always classifies outcome from stored lead + customer site rows.
 */
export async function resolveServiceLocationForLeadCustomerLink(
  tx: ExtendedTransactionClient,
  params: {
    organizationId: string;
    customerId: string;
    leadId: string;
    leadChannel: LeadChannel;
    leadAddress: Prisma.JsonValue | null;
    leadSignals: Prisma.JsonValue | null;
    customerLocations: CustomerServiceLocationRef[];
  },
): Promise<{ serviceLocationId: string | null; outcome: LeadCustomerLinkSiteOutcome }> {
  const snapshot = intakeSnapshotFromLeadRow({
    address: params.leadAddress,
    signals: params.leadSignals,
  });
  const outcome = classifyLeadIntakeAgainstCustomerSites(snapshot, params.customerLocations);

  if (outcome.kind === "no-address") {
    return { serviceLocationId: null, outcome };
  }

  if (outcome.kind === "existing-site") {
    return { serviceLocationId: outcome.serviceLocationId, outcome };
  }

  const attached = await attachIntakeServiceLocationToCustomerFromLead(tx, {
    organizationId: params.organizationId,
    customerId: params.customerId,
    leadId: params.leadId,
    leadChannel: params.leadChannel,
    snapshot,
  });

  return {
    serviceLocationId: attached.locationId,
    outcome,
  };
}

export type LinkLeadToCustomerTxParams = {
  organizationId: string;
  userId?: string | null;
  leadId: string;
  customerId: string;
  convertedAt: Date;
  /** Full-page link sets CONVERTED status; workspace link leaves status unchanged. */
  setStatusConverted?: boolean;
  recordLinkEvent?: boolean;
};

/**
 * Links a lead to a customer and resolves the jobsite in one transaction.
 */
export async function linkLeadToCustomerInTransaction(
  tx: ExtendedTransactionClient,
  params: LinkLeadToCustomerTxParams,
): Promise<{ serviceLocationId: string | null; outcome: LeadCustomerLinkSiteOutcome }> {
  const lead = await tx.lead.findFirst({
    where: {
      id: params.leadId,
      organizationId: params.organizationId,
      customerId: null,
    },
    select: { id: true, address: true, signals: true, channel: true },
  });
  if (!lead) {
    throw new Error(
      "This opportunity could not be linked. It may have been linked already—refresh the page and try again.",
    );
  }

  const customerLocations = await tx.customerServiceLocation.findMany({
    where: {
      customerId: params.customerId,
      organizationId: params.organizationId,
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      formattedAddress: true,
      addressLine1: true,
      googlePlaceId: true,
      isPrimary: true,
    },
  });

  const result = await tx.lead.updateMany({
    where: {
      id: params.leadId,
      organizationId: params.organizationId,
      customerId: null,
    },
    data: {
      customerId: params.customerId,
      convertedAt: params.convertedAt,
      ...(params.setStatusConverted ? { status: "CONVERTED" as const } : {}),
    },
  });
  if (result.count === 0) {
    throw new Error(
      "This opportunity could not be linked. It may have been linked already—refresh the page and try again.",
    );
  }

  const resolved = await resolveServiceLocationForLeadCustomerLink(tx, {
    organizationId: params.organizationId,
    customerId: params.customerId,
    leadId: params.leadId,
    leadChannel: lead.channel,
    leadAddress: lead.address,
    leadSignals: lead.signals,
    customerLocations,
  });

  if (resolved.serviceLocationId) {
    await tx.lead.update({
      where: { id: params.leadId },
      data: { serviceLocationId: resolved.serviceLocationId },
    });
  }

  if (params.recordLinkEvent && params.userId) {
    await tx.leadEvent.create({
      data: {
        leadId: params.leadId,
        type: "LINKED_TO_CUSTOMER",
        payload: {
          customerId: params.customerId,
          serviceLocationId: resolved.serviceLocationId,
          siteOutcome: resolved.outcome.kind,
        } as Prisma.InputJsonValue,
        actorUserId: params.userId,
      },
    });
  }

  return resolved;
}
