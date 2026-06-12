import assert from "node:assert/strict";
import test from "node:test";
import { SiteDetailsStatus } from "@prisma/client";
import {
  pickHigherPriorityStatus,
  materialAddressChanged,
  resolveSiteDetailsForServiceLocation,
} from "@/lib/site-details/resolver";

test("pickHigherPriorityStatus prefers user corrected over database", () => {
  const result = pickHigherPriorityStatus(
    SiteDetailsStatus.DATABASE_MATCH,
    SiteDetailsStatus.USER_CORRECTED,
  );
  assert.equal(result, SiteDetailsStatus.USER_CORRECTED);
});

test("materialAddressChanged detects postal code change", () => {
  const changed = materialAddressChanged(
    {
      formattedAddress: "123 Main St",
      addressLine1: "123 Main St",
      city: "SF",
      state: "CA",
      postalCode: "94107",
      country: "US",
    },
    {
      postalCode: "94108",
    },
  );
  assert.equal(changed, true);
});

test("materialAddressChanged ignores identical values", () => {
  const changed = materialAddressChanged(
    {
      formattedAddress: "123 Main St",
      addressLine1: "123 Main St",
      city: "SF",
      state: "CA",
      postalCode: "94107",
      country: "US",
    },
    {
      city: "SF",
    },
  );
  assert.equal(changed, false);
});

test("resolveSiteDetailsForServiceLocation prefers ZIP coverage source", async () => {
  const db = {
    customerServiceLocation: {
      findFirst: async () => ({
        id: "loc-1",
        organizationId: "org-1",
        formattedAddress: "401 Royal Tern Drive, Vacaville, CA 95687",
        addressLine1: "401 Royal Tern Drive",
        city: "Vacaville",
        state: "CA",
        postalCode: "95687",
        apn: "0137-081-100",
        apnSourceTitle: "Redfin",
        apnSourceUrl: "https://www.redfin.com/CA/Vacaville/401-Royal-Tern-Dr/home/2617854",
        apnDiscoveredAt: null,
        apnResearchUsageLogId: null,
        apnVerificationUrl: "https://assessor.solanocounty.com/search",
        apnConflictValue: null,
        apnConflictSourceTitle: null,
        apnConflictSourceUrl: null,
        apnConflictDetectedAt: null,
        utility: {
          id: "utility-1",
          name: "PG&E",
          utilityType: "ELECTRIC",
          officialWebsite: "https://www.pge.com",
          serviceUpgradeUrl: null,
          applicationPortalUrl: null,
          officialSourceTitle: "PG&E service territory",
          officialSourceUrl: "https://www.pge.com/service-territory",
        },
        jurisdiction: {
          id: "jurisdiction-1",
          name: "City of Vacaville",
          county: "Solano",
          state: "CA",
          buildingDepartmentName: null,
          officialWebsite: "https://www.cityofvacaville.gov",
          buildingDepartmentUrl: null,
          permitPortalUrl: null,
          sourceTitle: null,
          sourceUrl: null,
        },
        detailsStatus: "AI_FOUND",
        detailsSource: "AI_FOUND",
      }),
    },
    countyAssessorResource: {
      findFirst: async () => ({
        county: "Solano",
        state: "CA",
        assessorSearchUrl: "https://assessor.solanocounty.com/search",
        parcelGisUrl: null,
        sourceTitle: "Solano County Assessor",
        sourceUrl: "https://assessor.solanocounty.com/search",
      }),
    },
    utilityCoverage: {
      findMany: async () => [
        {
          utilityId: "utility-1",
          coverageType: "CITY",
          coverageValue: "Vacaville",
          sourceTitle: "PG&E city coverage",
          sourceUrl: "https://www.pge.com/city-coverage",
          confidence: "MEDIUM",
        },
        {
          utilityId: "utility-1",
          coverageType: "ZIP",
          coverageValue: "95687",
          sourceTitle: "PG&E ZIP coverage",
          sourceUrl: "https://www.pge.com/zip-coverage",
          confidence: "HIGH",
        },
      ],
    },
    quote: { findFirst: async () => null },
    lead: { findFirst: async () => null },
    job: { findFirst: async () => null },
  } as const;

  const resolved = await resolveSiteDetailsForServiceLocation(
    db as unknown as Parameters<typeof resolveSiteDetailsForServiceLocation>[0],
    { organizationId: "org-1", serviceLocationId: "loc-1" },
  );

  assert.ok(resolved);
  assert.equal(resolved.utility?.name, "PG&E");
  assert.equal(resolved.utility?.coverageSourceUrl, "https://www.pge.com/zip-coverage");
  assert.equal(resolved.assessorResource?.county, "Solano");
  assert.deepEqual(resolved.missingScopes, []);
});
