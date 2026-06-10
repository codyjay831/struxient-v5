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
  utility: { id: string; name: string } | null;
  jurisdiction: { id: string; name: string } | null;
  assessorResource: { county: string; state: string; assessorSearchUrl: string } | null;
  detailsStatus: SiteDetailsStatus;
  detailsSource: SiteDetailsSource;
  missingScopes: SiteDetailsMissingScope[];
};

type ResolverDb = Pick<
  PrismaClient,
  "customerServiceLocation" | "countyAssessorResource" | "quote" | "lead" | "job"
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
      state: true,
      apn: true,
      utility: { select: { id: true, name: true } },
      jurisdiction: { select: { id: true, name: true, county: true, state: true } },
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
        select: { county: true, state: true, assessorSearchUrl: true },
      })
    : null;

  const missing: SiteDetailsMissingScope[] = [];
  if (!row.apn?.trim()) missing.push("APN");
  if (!row.utility) missing.push("UTILITY");
  if (!row.jurisdiction) missing.push("JURISDICTION");
  if (!assessor) missing.push("ASSESSOR_RESOURCE");

  return {
    serviceLocationId: row.id,
    organizationId: row.organizationId,
    addressLine: row.formattedAddress.trim() || row.addressLine1.trim() || null,
    apn: row.apn?.trim() || null,
    utility: row.utility ? { id: row.utility.id, name: row.utility.name } : null,
    jurisdiction: row.jurisdiction ? { id: row.jurisdiction.id, name: row.jurisdiction.name } : null,
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
