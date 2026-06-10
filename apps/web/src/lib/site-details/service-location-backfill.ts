import { PrismaClient, CustomerServiceLocationSource } from "@prisma/client";
import {
  intakeSnapshotForCustomerFromLead,
  normalizeAddressDedupKey,
} from "@/lib/customer-service-location-from-lead";

export type CandidateLocation = {
  id: string;
  customerId: string | null;
  createdFromLeadId: string | null;
  googlePlaceId: string;
  addressFingerprint: string;
  formattedAddress: string;
  isPrimary: boolean;
  createdAt: Date;
};

type Snapshot = {
  primaryLine: string;
  placeId: string;
  fingerprint: string;
  source: CustomerServiceLocationSource;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
};

export type BackfillCounts = {
  matched: number;
  created: number;
  ambiguous: number;
  failed: number;
  skippedAlreadyLinked: number;
};

export type ServiceLocationBackfillReport = {
  locations: {
    fingerprintBackfilled: number;
  };
  leads: BackfillCounts;
  quotes: BackfillCounts;
  jobs: BackfillCounts;
};

export type BackfillDb = {
  organization: Pick<PrismaClient["organization"], "findMany">;
  customerServiceLocation: Pick<
    PrismaClient["customerServiceLocation"],
    "findMany" | "count" | "update" | "create"
  >;
  lead: Pick<PrismaClient["lead"], "findMany" | "update">;
  quote: Pick<PrismaClient["quote"], "findMany" | "update">;
  job: Pick<PrismaClient["job"], "findMany" | "update">;
};

function emptyCounts(): BackfillCounts {
  return { matched: 0, created: 0, ambiguous: 0, failed: 0, skippedAlreadyLinked: 0 };
}

function toSnapshot(leadRow: {
  address: unknown;
  signals: unknown;
}): Snapshot | null {
  const snap = intakeSnapshotForCustomerFromLead({
    address: leadRow.address as never,
    signals: leadRow.signals as never,
  });
  if (!snap) return null;
  const primaryLine = snap.formattedAddress.trim() || snap.addressLine1.trim();
  if (!primaryLine) return null;
  const placeId = (snap.googlePlaceId ?? "").trim();
  const fingerprint = normalizeAddressDedupKey(snap.formattedAddress, snap.addressLine1);
  return {
    primaryLine,
    placeId,
    fingerprint,
    source:
      snap.source === "google_places"
        ? CustomerServiceLocationSource.google_places
        : CustomerServiceLocationSource.manual,
    addressLine1: snap.addressLine1.trim() || primaryLine,
    addressLine2: snap.addressLine2 ?? "",
    city: snap.city ?? "",
    state: snap.state ?? "",
    postalCode: snap.postalCode ?? "",
    country: snap.country ?? "",
    latitude: snap.latitude,
    longitude: snap.longitude,
  };
}

function rankCandidates(
  candidates: CandidateLocation[],
  params: {
    customerId: string | null;
    leadId: string | null;
    placeId: string;
    fingerprint: string;
  },
): CandidateLocation[] {
  const { customerId, leadId, placeId, fingerprint } = params;
  return [...candidates]
    .filter((c) => (customerId ? c.customerId === customerId : true))
    .sort((a, b) => {
      const score = (c: CandidateLocation) => {
        let s = 0;
        if (leadId && c.createdFromLeadId === leadId) s += 100;
        if (customerId && c.customerId === customerId) s += 30;
        if (placeId && c.googlePlaceId.trim() === placeId) s += 20;
        if (fingerprint && c.addressFingerprint === fingerprint) s += 10;
        if (c.isPrimary) s += 3;
        return s;
      };
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

export function resolveLocationCandidate(
  allLocations: CandidateLocation[],
  params: {
    customerId: string | null;
    leadId: string | null;
    snapshot: Snapshot | null;
  },
): { kind: "matched"; locationId: string } | { kind: "ambiguous" } | { kind: "none" } {
  const { customerId, leadId, snapshot } = params;
  if (!snapshot) return { kind: "none" };

  const ranked = rankCandidates(allLocations, {
    customerId,
    leadId,
    placeId: snapshot.placeId,
    fingerprint: snapshot.fingerprint,
  });

  if (ranked.length === 0) return { kind: "none" };
  if (ranked.length === 1) return { kind: "matched", locationId: ranked[0].id };

  const score = (c: CandidateLocation) => {
    let s = 0;
    if (leadId && c.createdFromLeadId === leadId) s += 100;
    if (customerId && c.customerId === customerId) s += 30;
    if (snapshot.placeId && c.googlePlaceId.trim() === snapshot.placeId) s += 20;
    if (snapshot.fingerprint && c.addressFingerprint === snapshot.fingerprint) s += 10;
    if (c.isPrimary) s += 3;
    return s;
  };

  const best = score(ranked[0]);
  const second = score(ranked[1]);
  if (best > second) {
    return { kind: "matched", locationId: ranked[0].id };
  }
  return { kind: "ambiguous" };
}

export async function runServiceLocationBackfill(
  prisma: BackfillDb,
): Promise<ServiceLocationBackfillReport> {
  const report: ServiceLocationBackfillReport = {
    locations: { fingerprintBackfilled: 0 },
    leads: emptyCounts(),
    quotes: emptyCounts(),
    jobs: emptyCounts(),
  };

  const orgs = await prisma.organization.findMany({
    select: { id: true },
  });

  for (const org of orgs) {
    const existingLocations = await prisma.customerServiceLocation.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        customerId: true,
        createdFromLeadId: true,
        googlePlaceId: true,
        addressFingerprint: true,
        formattedAddress: true,
        addressLine1: true,
        isPrimary: true,
        createdAt: true,
      },
    });

    const byId = new Map(existingLocations.map((l) => [l.id, l]));
    const locationRows: CandidateLocation[] = existingLocations.map((l) => ({
      id: l.id,
      customerId: l.customerId,
      createdFromLeadId: l.createdFromLeadId,
      googlePlaceId: (l.googlePlaceId ?? "").trim(),
      addressFingerprint:
        l.addressFingerprint.trim() ||
        normalizeAddressDedupKey(l.formattedAddress, l.addressLine1 || ""),
      formattedAddress: l.formattedAddress,
      isPrimary: l.isPrimary,
      createdAt: l.createdAt,
    }));

    for (const loc of locationRows) {
      const source = byId.get(loc.id);
      if (!source) continue;
      if (!source.addressFingerprint.trim() && loc.addressFingerprint) {
        await prisma.customerServiceLocation.update({
          where: { id: loc.id },
          data: { addressFingerprint: loc.addressFingerprint },
        });
        report.locations.fingerprintBackfilled += 1;
      }
    }

    const leads = await prisma.lead.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        customerId: true,
        serviceLocationId: true,
        address: true,
        signals: true,
      },
    });

    for (const lead of leads) {
      if (lead.serviceLocationId) {
        report.leads.skippedAlreadyLinked += 1;
        continue;
      }
      const snap = toSnapshot(lead);
      const resolved = resolveLocationCandidate(locationRows, {
        customerId: lead.customerId ?? null,
        leadId: lead.id,
        snapshot: snap,
      });

      if (resolved.kind === "ambiguous") {
        report.leads.ambiguous += 1;
        continue;
      }

      if (resolved.kind === "matched") {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { serviceLocationId: resolved.locationId },
        });
        report.leads.matched += 1;
        continue;
      }

      if (!snap) {
        report.leads.failed += 1;
        continue;
      }

      const customerLocationCount = lead.customerId
        ? await prisma.customerServiceLocation.count({
            where: { organizationId: org.id, customerId: lead.customerId },
          })
        : 0;
      const created = await prisma.customerServiceLocation.create({
        data: {
          organizationId: org.id,
          customerId: lead.customerId ?? null,
          createdFromLeadId: lead.id,
          formattedAddress: snap.primaryLine,
          addressLine1: snap.addressLine1,
          addressLine2: snap.addressLine2,
          city: snap.city,
          state: snap.state,
          postalCode: snap.postalCode,
          country: snap.country,
          googlePlaceId: snap.placeId,
          addressFingerprint: snap.fingerprint,
          latitude: snap.latitude,
          longitude: snap.longitude,
          source: snap.source,
          label: lead.customerId ? "Backfilled from lead" : "Backfilled provisional lead location",
          isPrimary: lead.customerId ? customerLocationCount === 0 : false,
        },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { serviceLocationId: created.id },
      });
      locationRows.push({
        id: created.id,
        customerId: created.customerId,
        createdFromLeadId: created.createdFromLeadId,
        googlePlaceId: created.googlePlaceId,
        addressFingerprint: created.addressFingerprint,
        formattedAddress: created.formattedAddress,
        isPrimary: created.isPrimary,
        createdAt: created.createdAt,
      });
      report.leads.created += 1;
    }

    const leadLocMap = new Map(
      (
        await prisma.lead.findMany({
          where: { organizationId: org.id },
          select: { id: true, serviceLocationId: true, address: true, signals: true, customerId: true },
        })
      ).map((l) => [l.id, l]),
    );

    const quotes = await prisma.quote.findMany({
      where: { organizationId: org.id },
      select: { id: true, leadId: true, customerId: true, serviceLocationId: true },
    });
    for (const quote of quotes) {
      if (quote.serviceLocationId) {
        report.quotes.skippedAlreadyLinked += 1;
        continue;
      }
      if (quote.leadId) {
        const lead = leadLocMap.get(quote.leadId);
        if (lead?.serviceLocationId) {
          await prisma.quote.update({
            where: { id: quote.id },
            data: { serviceLocationId: lead.serviceLocationId },
          });
          report.quotes.matched += 1;
          continue;
        }
        if (lead) {
          const resolved = resolveLocationCandidate(locationRows, {
            customerId: quote.customerId ?? lead.customerId ?? null,
            leadId: lead.id,
            snapshot: toSnapshot(lead),
          });
          if (resolved.kind === "matched") {
            await prisma.quote.update({
              where: { id: quote.id },
              data: { serviceLocationId: resolved.locationId },
            });
            report.quotes.matched += 1;
            continue;
          }
          if (resolved.kind === "ambiguous") {
            report.quotes.ambiguous += 1;
            continue;
          }
        }
      }

      if (quote.customerId) {
        const custLocations = locationRows.filter((l) => l.customerId === quote.customerId);
        if (custLocations.length === 1) {
          await prisma.quote.update({
            where: { id: quote.id },
            data: { serviceLocationId: custLocations[0].id },
          });
          report.quotes.matched += 1;
          continue;
        }
        if (custLocations.length > 1) {
          const primary = custLocations.filter((l) => l.isPrimary);
          if (primary.length === 1) {
            await prisma.quote.update({
              where: { id: quote.id },
              data: { serviceLocationId: primary[0].id },
            });
            report.quotes.matched += 1;
            continue;
          }
          report.quotes.ambiguous += 1;
          continue;
        }
      }

      report.quotes.failed += 1;
    }

    const quoteLocMap = new Map(
      (await prisma.quote.findMany({
        where: { organizationId: org.id },
        select: { id: true, serviceLocationId: true },
      })).map((q) => [q.id, q.serviceLocationId]),
    );

    const jobs = await prisma.job.findMany({
      where: { organizationId: org.id },
      select: { id: true, quoteId: true, serviceLocationId: true },
    });
    for (const job of jobs) {
      if (job.serviceLocationId) {
        report.jobs.skippedAlreadyLinked += 1;
        continue;
      }
      const quoteLocId = quoteLocMap.get(job.quoteId) ?? null;
      if (quoteLocId) {
        await prisma.job.update({
          where: { id: job.id },
          data: { serviceLocationId: quoteLocId },
        });
        report.jobs.matched += 1;
      } else {
        report.jobs.failed += 1;
      }
    }
  }

  return report;
}
