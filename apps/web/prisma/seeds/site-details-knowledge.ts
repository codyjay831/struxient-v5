import {
  CoverageConfidence,
  JurisdictionType,
  PrismaClient,
  SourceStatus,
  UtilityCoverageType,
  UtilityType,
} from "@prisma/client";

type UtilitySeed = {
  name: string;
  utilityType: UtilityType;
  officialWebsite?: string;
  serviceUpgradeUrl?: string;
  applicationPortalUrl?: string;
  officialSourceUrl?: string;
  coverage: Array<{
    coverageType: UtilityCoverageType;
    coverageValue: string;
    state: string;
    city?: string;
    county?: string;
    sourceUrl?: string;
    confidence?: CoverageConfidence;
  }>;
};

const DEV_UTILITY_SEEDS: UtilitySeed[] = [
  {
    name: "PG&E",
    utilityType: UtilityType.ELECTRIC,
    officialWebsite: "https://www.pge.com",
    serviceUpgradeUrl: "https://www.pge.com/en_US/residential/customer-service/new-service.page",
    applicationPortalUrl: "https://www.pge.com/",
    officialSourceUrl: "https://www.pge.com/en_US/residential/customer-service/new-service.page",
    coverage: [
      {
        coverageType: UtilityCoverageType.ZIP,
        coverageValue: "94107",
        state: "CA",
        city: "San Francisco",
        county: "San Francisco",
        sourceUrl: "https://www.pge.com/en_US/about-pge/company-information/profile/service-territory.page",
        confidence: CoverageConfidence.HIGH,
      },
    ],
  },
  {
    name: "SFPUC Water",
    utilityType: UtilityType.WATER,
    officialWebsite: "https://sfpuc.gov",
    applicationPortalUrl: "https://sfpuc.org/accounts-services/start-stop-service",
    officialSourceUrl: "https://sfpuc.org/accounts-services/start-stop-service",
    coverage: [
      {
        coverageType: UtilityCoverageType.CITY,
        coverageValue: "San Francisco",
        state: "CA",
        city: "San Francisco",
        county: "San Francisco",
        sourceUrl: "https://sfpuc.gov/accounts-services/start-stop-service",
        confidence: CoverageConfidence.MEDIUM,
      },
    ],
  },
];

const DEV_JURISDICTIONS = [
  {
    name: "San Francisco Department of Building Inspection",
    jurisdictionType: JurisdictionType.CITY,
    state: "CA",
    county: "San Francisco",
    officialWebsite: "https://sfdbi.org",
    buildingDepartmentName: "Department of Building Inspection",
    buildingDepartmentUrl: "https://sfdbi.org",
    permitPortalUrl: "https://www.sf.gov/departments/department-building-inspection",
    sourceUrl: "https://www.sf.gov/departments/department-building-inspection",
  },
];

const DEV_ASSESSOR_RESOURCES = [
  {
    county: "San Francisco",
    state: "CA",
    assessorSearchUrl: "https://www.sfassessor.org/property-information/homeowners/property-search-tool",
    parcelGisUrl: "https://sfgov.maps.arcgis.com/apps/webappviewer/index.html",
    sourceUrl: "https://www.sfassessor.org/property-information/homeowners/property-search-tool",
  },
];

export async function seedSiteDetailsKnowledge(prisma: PrismaClient, organizationId: string) {
  let utilitiesSeeded = 0;
  let coverageSeeded = 0;
  let jurisdictionsSeeded = 0;
  let assessorsSeeded = 0;

  for (const utility of DEV_UTILITY_SEEDS) {
    const utilityRow = await prisma.utility.upsert({
      where: { organizationId_name: { organizationId, name: utility.name } },
      update: {
        utilityType: utility.utilityType,
        officialWebsite: utility.officialWebsite ?? null,
        serviceUpgradeUrl: utility.serviceUpgradeUrl ?? null,
        applicationPortalUrl: utility.applicationPortalUrl ?? null,
        officialSourceUrl: utility.officialSourceUrl ?? null,
        sourceStatus: SourceStatus.OFFICIAL,
        isActive: true,
      },
      create: {
        organizationId,
        name: utility.name,
        utilityType: utility.utilityType,
        officialWebsite: utility.officialWebsite ?? null,
        serviceUpgradeUrl: utility.serviceUpgradeUrl ?? null,
        applicationPortalUrl: utility.applicationPortalUrl ?? null,
        officialSourceUrl: utility.officialSourceUrl ?? null,
        sourceStatus: SourceStatus.OFFICIAL,
        isActive: true,
      },
    });
    utilitiesSeeded += 1;

    for (const cov of utility.coverage) {
      await prisma.utilityCoverage.upsert({
        where: {
          id: `${organizationId}:${utilityRow.id}:${cov.coverageType}:${cov.coverageValue}:${cov.state}`,
        },
        update: {
          city: cov.city ?? null,
          county: cov.county ?? null,
          sourceUrl: cov.sourceUrl ?? null,
          sourceStatus: SourceStatus.OFFICIAL,
          confidence: cov.confidence ?? CoverageConfidence.MEDIUM,
          isActive: true,
        },
        create: {
          id: `${organizationId}:${utilityRow.id}:${cov.coverageType}:${cov.coverageValue}:${cov.state}`,
          organizationId,
          utilityId: utilityRow.id,
          coverageType: cov.coverageType,
          coverageValue: cov.coverageValue,
          state: cov.state,
          city: cov.city ?? null,
          county: cov.county ?? null,
          sourceUrl: cov.sourceUrl ?? null,
          sourceStatus: SourceStatus.OFFICIAL,
          confidence: cov.confidence ?? CoverageConfidence.MEDIUM,
          isActive: true,
        },
      });
      coverageSeeded += 1;
    }
  }

  for (const j of DEV_JURISDICTIONS) {
    await prisma.jurisdiction.upsert({
      where: {
        organizationId_name_state_jurisdictionType: {
          organizationId,
          name: j.name,
          state: j.state,
          jurisdictionType: j.jurisdictionType,
        },
      },
      update: {
        county: j.county ?? null,
        officialWebsite: j.officialWebsite ?? null,
        buildingDepartmentName: j.buildingDepartmentName ?? null,
        buildingDepartmentUrl: j.buildingDepartmentUrl ?? null,
        permitPortalUrl: j.permitPortalUrl ?? null,
        sourceUrl: j.sourceUrl ?? null,
        sourceStatus: SourceStatus.OFFICIAL,
        isActive: true,
      },
      create: {
        organizationId,
        name: j.name,
        jurisdictionType: j.jurisdictionType,
        state: j.state,
        county: j.county ?? null,
        officialWebsite: j.officialWebsite ?? null,
        buildingDepartmentName: j.buildingDepartmentName ?? null,
        buildingDepartmentUrl: j.buildingDepartmentUrl ?? null,
        permitPortalUrl: j.permitPortalUrl ?? null,
        sourceUrl: j.sourceUrl ?? null,
        sourceStatus: SourceStatus.OFFICIAL,
        isActive: true,
      },
    });
    jurisdictionsSeeded += 1;
  }

  for (const a of DEV_ASSESSOR_RESOURCES) {
    await prisma.countyAssessorResource.upsert({
      where: {
        organizationId_county_state: {
          organizationId,
          county: a.county,
          state: a.state,
        },
      },
      update: {
        assessorSearchUrl: a.assessorSearchUrl,
        parcelGisUrl: a.parcelGisUrl ?? null,
        sourceUrl: a.sourceUrl ?? null,
        sourceStatus: SourceStatus.OFFICIAL,
        isActive: true,
      },
      create: {
        organizationId,
        county: a.county,
        state: a.state,
        assessorSearchUrl: a.assessorSearchUrl,
        parcelGisUrl: a.parcelGisUrl ?? null,
        sourceUrl: a.sourceUrl ?? null,
        sourceStatus: SourceStatus.OFFICIAL,
        isActive: true,
      },
    });
    assessorsSeeded += 1;
  }

  return {
    utilitiesSeeded,
    coverageSeeded,
    jurisdictionsSeeded,
    assessorsSeeded,
  };
}
