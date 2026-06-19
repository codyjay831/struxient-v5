export type SiteDetailsStatusValue =
  | "DATABASE_MATCH"
  | "AI_FOUND"
  | "USER_REVIEWED"
  | "USER_CORRECTED"
  | "UNVERIFIED"
  | "CONFLICT"
  | "STALE";

export type SiteDetailsMissingScope =
  | "APN"
  | "UTILITY"
  | "JURISDICTION"
  | "ASSESSOR_RESOURCE";

export type SiteDetailsRowData = {
  serviceLocationId: string | null;
  line: string | null;
  apn: string | null;
  apnSourceTitle?: string | null;
  apnSourceUrl?: string | null;
  apnVerificationUrl?: string | null;
  apnConflict?: {
    value: string;
    sourceTitle: string | null;
    sourceUrl: string | null;
  } | null;
  utilityName: string | null;
  utilityOfficialWebsite?: string | null;
  utilityServiceUpgradeUrl?: string | null;
  utilityCoverageSourceTitle?: string | null;
  utilityCoverageSourceUrl?: string | null;
  jurisdictionName: string | null;
  jurisdictionBuildingDepartmentName?: string | null;
  jurisdictionOfficialWebsite?: string | null;
  jurisdictionBuildingDepartmentUrl?: string | null;
  jurisdictionPermitPortalUrl?: string | null;
  jurisdictionFormsUrl?: string | null;
  jurisdictionInspectionsUrl?: string | null;
  assessorCounty?: string | null;
  assessorState?: string | null;
  assessorSearchUrl?: string | null;
  assessorParcelGisUrl?: string | null;
  detailsStatus: SiteDetailsStatusValue;
  missingScopes: SiteDetailsMissingScope[];
};

export type SiteDetailsPayload = Omit<SiteDetailsRowData, "line">;

type ResolvedSiteDetailsLike = {
  serviceLocationId: string;
  apn: string | null;
  apnSourceTitle: string | null;
  apnSourceUrl: string | null;
  apnVerificationUrl: string | null;
  apnConflict: {
    value: string;
    sourceTitle: string | null;
    sourceUrl: string | null;
  } | null;
  utility: {
    name: string;
    officialWebsite: string | null;
    serviceUpgradeUrl: string | null;
    coverageSourceTitle: string | null;
    coverageSourceUrl: string | null;
  } | null;
  jurisdiction: {
    name: string;
    buildingDepartmentName: string | null;
    officialWebsite: string | null;
    buildingDepartmentUrl: string | null;
    permitPortalUrl: string | null;
  } | null;
  assessorResource: {
    county: string;
    state: string;
    assessorSearchUrl: string;
    parcelGisUrl: string | null;
  } | null;
  detailsStatus: SiteDetailsStatusValue;
  missingScopes: SiteDetailsMissingScope[];
};

export const DEFAULT_SITE_DETAILS_MISSING_SCOPES: SiteDetailsMissingScope[] = [
  "APN",
  "UTILITY",
  "JURISDICTION",
  "ASSESSOR_RESOURCE",
];

export function siteDetailsPayloadFromResolved(
  details: ResolvedSiteDetailsLike,
): SiteDetailsPayload {
  return {
    serviceLocationId: details.serviceLocationId,
    apn: details.apn,
    apnSourceTitle: details.apnSourceTitle,
    apnSourceUrl: details.apnSourceUrl,
    apnVerificationUrl: details.apnVerificationUrl,
    apnConflict: details.apnConflict,
    utilityName: details.utility?.name ?? null,
    utilityOfficialWebsite: details.utility?.officialWebsite ?? null,
    utilityServiceUpgradeUrl: details.utility?.serviceUpgradeUrl ?? null,
    utilityCoverageSourceTitle: details.utility?.coverageSourceTitle ?? null,
    utilityCoverageSourceUrl: details.utility?.coverageSourceUrl ?? null,
    jurisdictionName: details.jurisdiction?.name ?? null,
    jurisdictionBuildingDepartmentName: details.jurisdiction?.buildingDepartmentName ?? null,
    jurisdictionOfficialWebsite: details.jurisdiction?.officialWebsite ?? null,
    jurisdictionBuildingDepartmentUrl: details.jurisdiction?.buildingDepartmentUrl ?? null,
    jurisdictionPermitPortalUrl: details.jurisdiction?.permitPortalUrl ?? null,
    jurisdictionFormsUrl: null,
    jurisdictionInspectionsUrl: null,
    assessorCounty: details.assessorResource?.county ?? null,
    assessorState: details.assessorResource?.state ?? null,
    assessorSearchUrl: details.assessorResource?.assessorSearchUrl ?? null,
    assessorParcelGisUrl: details.assessorResource?.parcelGisUrl ?? null,
    detailsStatus: details.detailsStatus,
    missingScopes: details.missingScopes,
  };
}

function deriveMissingScopesFromPayload(
  siteDetails: Partial<SiteDetailsPayload> | null | undefined,
): SiteDetailsMissingScope[] {
  if (!siteDetails) {
    return DEFAULT_SITE_DETAILS_MISSING_SCOPES;
  }
  if (siteDetails.missingScopes) {
    return siteDetails.missingScopes;
  }
  return [
    ...(siteDetails.apn?.trim() ? [] : ["APN" as const]),
    ...(siteDetails.utilityName ? [] : ["UTILITY" as const]),
    ...(siteDetails.jurisdictionName ? [] : ["JURISDICTION" as const]),
    ...(siteDetails.assessorSearchUrl || siteDetails.assessorParcelGisUrl
      ? []
      : ["ASSESSOR_RESOURCE" as const]),
  ];
}

export function toSiteDetailsRowData(params: {
  line: string | null;
  siteDetails: Partial<SiteDetailsPayload> | null | undefined;
  serviceLocationId?: string | null;
}): SiteDetailsRowData {
  return {
    serviceLocationId: params.serviceLocationId ?? params.siteDetails?.serviceLocationId ?? null,
    line: params.line,
    apn: params.siteDetails?.apn ?? null,
    apnSourceTitle: params.siteDetails?.apnSourceTitle ?? null,
    apnSourceUrl: params.siteDetails?.apnSourceUrl ?? null,
    apnVerificationUrl: params.siteDetails?.apnVerificationUrl ?? null,
    apnConflict: params.siteDetails?.apnConflict ?? null,
    utilityName: params.siteDetails?.utilityName ?? null,
    utilityOfficialWebsite: params.siteDetails?.utilityOfficialWebsite ?? null,
    utilityServiceUpgradeUrl: params.siteDetails?.utilityServiceUpgradeUrl ?? null,
    utilityCoverageSourceTitle: params.siteDetails?.utilityCoverageSourceTitle ?? null,
    utilityCoverageSourceUrl: params.siteDetails?.utilityCoverageSourceUrl ?? null,
    jurisdictionName: params.siteDetails?.jurisdictionName ?? null,
    jurisdictionBuildingDepartmentName: params.siteDetails?.jurisdictionBuildingDepartmentName ?? null,
    jurisdictionOfficialWebsite: params.siteDetails?.jurisdictionOfficialWebsite ?? null,
    jurisdictionBuildingDepartmentUrl: params.siteDetails?.jurisdictionBuildingDepartmentUrl ?? null,
    jurisdictionPermitPortalUrl: params.siteDetails?.jurisdictionPermitPortalUrl ?? null,
    jurisdictionFormsUrl: params.siteDetails?.jurisdictionFormsUrl ?? null,
    jurisdictionInspectionsUrl: params.siteDetails?.jurisdictionInspectionsUrl ?? null,
    assessorCounty: params.siteDetails?.assessorCounty ?? null,
    assessorState: params.siteDetails?.assessorState ?? null,
    assessorSearchUrl: params.siteDetails?.assessorSearchUrl ?? null,
    assessorParcelGisUrl: params.siteDetails?.assessorParcelGisUrl ?? null,
    detailsStatus: params.siteDetails?.detailsStatus ?? "UNVERIFIED",
    missingScopes: deriveMissingScopesFromPayload(params.siteDetails),
  };
}
