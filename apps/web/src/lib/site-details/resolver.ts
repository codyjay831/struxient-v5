import {
  SiteDetailsSource,
  SiteDetailsStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

export type SiteDetailsMissingScope = "APN" | "UTILITY" | "JURISDICTION" | "ASSESSOR_RESOURCE";

export const SITE_DETAILS_PRIORITY: ReadonlyArray<SiteDetailsStatus> = [
  SiteDetailsStatus.USER_CORRECTED,
  SiteDetailsStatus.USER_REVIEWED,
  SiteDetailsStatus.AI_FOUND,
  SiteDetailsStatus.DATABASE_MATCH,
  SiteDetailsStatus.UNVERIFIED,
  SiteDetailsStatus.STALE,
  SiteDetailsStatus.CONFLICT,
];

export function pickHigherPriorityStatus(
  left: SiteDetailsStatus,
  right: SiteDetailsStatus,
): SiteDetailsStatus {
  const l = SITE_DETAILS_PRIORITY.indexOf(left);
  const r = SITE_DETAILS_PRIORITY.indexOf(right);
  if (l === -1) return right;
  if (r === -1) return left;
  return l <= r ? left : right;
}

export type SiteDetailsResolved = {
  serviceLocationId: string;
  organizationId: string;
  addressLine: string | null;
  apn: string | null;
  apnSourceTitle: string | null;
  apnSourceUrl: string | null;
  apnDiscoveredAt: Date | null;
  apnResearchUsageLogId: string | null;
  apnVerificationUrl: string | null;
  apnConflict: {
    value: string;
    sourceTitle: string | null;
    sourceUrl: string | null;
    detectedAt: Date | null;
  } | null;
  utility: {
    id: string;
    name: string;
    officialWebsite: string | null;
    serviceUpgradeUrl: string | null;
    applicationPortalUrl: string | null;
    coverageSourceTitle: string | null;
    coverageSourceUrl: string | null;
    officialSourceTitle: string | null;
    officialSourceUrl: string | null;
  } | null;
  jurisdiction: {
    id: string;
    name: string;
    buildingDepartmentName: string | null;
    officialWebsite: string | null;
    buildingDepartmentUrl: string | null;
    permitPortalUrl: string | null;
    sourceTitle: string | null;
    sourceUrl: string | null;
  } | null;
  assessorResource: {
    county: string;
    state: string;
    assessorSearchUrl: string;
    parcelGisUrl: string | null;
    sourceTitle: string | null;
    sourceUrl: string | null;
  } | null;
  detailsStatus: SiteDetailsStatus;
  detailsSource: SiteDetailsSource;
  missingScopes: SiteDetailsMissingScope[];
};

type ResolverDb = Pick<
  PrismaClient,
  "customerServiceLocation" | "countyAssessorResource" | "utilityCoverage" | "quote" | "lead" | "job"
>;

export async function resolveSiteDetailsForServiceLocation(
  db: ResolverDb,
  params: { organizationId: string; serviceLocationId: string },
): Promise<SiteDetailsResolved | null> {
  const row = await db.customerServiceLocation.findFirst({
    where: { id: params.serviceLocationId, organizationId: params.organizationId },
    select: {
      id: true,
      organizationId: true,
      formattedAddress: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      apn: true,
      apnSourceTitle: true,
      apnSourceUrl: true,
      apnDiscoveredAt: true,
      apnResearchUsageLogId: true,
      apnVerificationUrl: true,
      apnConflictValue: true,
      apnConflictSourceTitle: true,
      apnConflictSourceUrl: true,
      apnConflictDetectedAt: true,
      utility: {
        select: {
          id: true,
          name: true,
          officialWebsite: true,
          serviceUpgradeUrl: true,
          applicationPortalUrl: true,
          officialSourceTitle: true,
          officialSourceUrl: true,
        },
      },
      jurisdiction: {
        select: {
          id: true,
          name: true,
          county: true,
          state: true,
          buildingDepartmentName: true,
          officialWebsite: true,
          buildingDepartmentUrl: true,
          permitPortalUrl: true,
          sourceTitle: true,
          sourceUrl: true,
        },
      },
      detailsStatus: true,
      detailsSource: true,
    },
  });
  if (!row) return null;
  const assessorCounty = row.jurisdiction?.county ?? null;
  const assessorState = row.jurisdiction?.state ?? row.state;
  const assessor = assessorCounty
    ? await db.countyAssessorResource.findFirst({
        where: {
          organizationId: params.organizationId,
          county: assessorCounty,
          state: assessorState || "",
          isActive: true,
        },
        select: {
          county: true,
          state: true,
          assessorSearchUrl: true,
          parcelGisUrl: true,
          sourceTitle: true,
          sourceUrl: true,
        },
      })
    : null;

  const missing: SiteDetailsMissingScope[] = [];
  if (!row.apn?.trim()) missing.push("APN");
  if (!row.utility) missing.push("UTILITY");
  if (!row.jurisdiction) missing.push("JURISDICTION");
  if (!assessor) missing.push("ASSESSOR_RESOURCE");

  const utilityCoverage = row.utility
    ? await db.utilityCoverage.findFirst({
        where: {
          organizationId: params.organizationId,
          utilityId: row.utility.id,
          isActive: true,
          OR: [
            {
              coverageType: "ZIP",
              coverageValue: row.postalCode,
              state: row.state,
            },
            {
              coverageType: "CITY",
              coverageValue: row.city,
              state: row.state,
            },
            {
              coverageType: "COUNTY",
              coverageValue: row.jurisdiction?.county ?? "",
              state: row.state,
            },
          ],
        },
        select: { sourceTitle: true, sourceUrl: true },
      })
    : null;

  return {
    serviceLocationId: row.id,
    organizationId: row.organizationId,
    addressLine: row.formattedAddress.trim() || row.addressLine1.trim() || null,
    apn: row.apn?.trim() || null,
    apnSourceTitle: row.apnSourceTitle?.trim() || null,
    apnSourceUrl: row.apnSourceUrl?.trim() || null,
    apnDiscoveredAt: row.apnDiscoveredAt ?? null,
    apnResearchUsageLogId: row.apnResearchUsageLogId ?? null,
    apnVerificationUrl: row.apnVerificationUrl?.trim() || assessor?.assessorSearchUrl || null,
    apnConflict: row.apnConflictValue
      ? {
          value: row.apnConflictValue,
          sourceTitle: row.apnConflictSourceTitle?.trim() || null,
          sourceUrl: row.apnConflictSourceUrl?.trim() || null,
          detectedAt: row.apnConflictDetectedAt ?? null,
        }
      : null,
    utility: row.utility
      ? {
          id: row.utility.id,
          name: row.utility.name,
          officialWebsite: row.utility.officialWebsite?.trim() || null,
          serviceUpgradeUrl: row.utility.serviceUpgradeUrl?.trim() || null,
          applicationPortalUrl: row.utility.applicationPortalUrl?.trim() || null,
          coverageSourceTitle: utilityCoverage?.sourceTitle?.trim() || null,
          coverageSourceUrl: utilityCoverage?.sourceUrl?.trim() || null,
          officialSourceTitle: row.utility.officialSourceTitle?.trim() || null,
          officialSourceUrl: row.utility.officialSourceUrl?.trim() || null,
        }
      : null,
    jurisdiction: row.jurisdiction
      ? {
          id: row.jurisdiction.id,
          name: row.jurisdiction.name,
          buildingDepartmentName: row.jurisdiction.buildingDepartmentName?.trim() || null,
          officialWebsite: row.jurisdiction.officialWebsite?.trim() || null,
          buildingDepartmentUrl: row.jurisdiction.buildingDepartmentUrl?.trim() || null,
          permitPortalUrl: row.jurisdiction.permitPortalUrl?.trim() || null,
          sourceTitle: row.jurisdiction.sourceTitle?.trim() || null,
          sourceUrl: row.jurisdiction.sourceUrl?.trim() || null,
        }
      : null,
    assessorResource: assessor,
    detailsStatus: row.detailsStatus,
    detailsSource: row.detailsSource,
    missingScopes: missing,
  };
}

export async function resolveServiceLocationIdFromEntity(
  db: ResolverDb,
  params:
    | { organizationId: string; quoteId: string; leadId?: never; jobId?: never }
    | { organizationId: string; leadId: string; quoteId?: never; jobId?: never }
    | { organizationId: string; jobId: string; quoteId?: never; leadId?: never },
): Promise<string | null> {
  if ("quoteId" in params) {
    const row = await db.quote.findFirst({
      where: { id: params.quoteId, organizationId: params.organizationId },
      select: { serviceLocationId: true },
    });
    return row?.serviceLocationId ?? null;
  }
  if ("leadId" in params) {
    const row = await db.lead.findFirst({
      where: { id: params.leadId, organizationId: params.organizationId },
      select: { serviceLocationId: true },
    });
    return row?.serviceLocationId ?? null;
  }
  const row = await db.job.findFirst({
    where: { id: params.jobId, organizationId: params.organizationId },
    select: { serviceLocationId: true },
  });
  return row?.serviceLocationId ?? null;
}

export function materialAddressChanged(
  previous: {
    formattedAddress: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  },
  next: Prisma.CustomerServiceLocationUpdateInput,
): boolean {
  const nextAddr = {
    formattedAddress:
      typeof next.formattedAddress === "string" ? next.formattedAddress : previous.formattedAddress,
    addressLine1: typeof next.addressLine1 === "string" ? next.addressLine1 : previous.addressLine1,
    city: typeof next.city === "string" ? next.city : previous.city,
    state: typeof next.state === "string" ? next.state : previous.state,
    postalCode: typeof next.postalCode === "string" ? next.postalCode : previous.postalCode,
    country: typeof next.country === "string" ? next.country : previous.country,
  };
  return (
    previous.formattedAddress !== nextAddr.formattedAddress ||
    previous.addressLine1 !== nextAddr.addressLine1 ||
    previous.city !== nextAddr.city ||
    previous.state !== nextAddr.state ||
    previous.postalCode !== nextAddr.postalCode ||
    previous.country !== nextAddr.country
  );
}
