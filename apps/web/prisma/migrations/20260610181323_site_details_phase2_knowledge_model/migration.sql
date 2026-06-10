-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('ELECTRIC', 'GAS', 'WATER', 'OTHER');

-- CreateEnum
CREATE TYPE "UtilityCoverageType" AS ENUM ('ZIP', 'CITY', 'COUNTY');

-- CreateEnum
CREATE TYPE "CoverageConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "JurisdictionType" AS ENUM ('CITY', 'COUNTY', 'UNINCORPORATED_COUNTY', 'DISTRICT');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('UNVERIFIED', 'OFFICIAL', 'STALE', 'BROKEN');

-- CreateEnum
CREATE TYPE "SiteDetailsStatus" AS ENUM ('DATABASE_MATCH', 'AI_FOUND', 'USER_REVIEWED', 'USER_CORRECTED', 'UNVERIFIED', 'CONFLICT', 'STALE');

-- CreateEnum
CREATE TYPE "SiteDetailsSource" AS ENUM ('DATABASE_MATCH', 'AI_FOUND', 'USER_REVIEWED', 'USER_CORRECTED');

-- CreateEnum
CREATE TYPE "ServiceLocationAuditType" AS ENUM ('APN_SET', 'APN_CORRECTED', 'UTILITY_SET', 'UTILITY_CORRECTED', 'JURISDICTION_SET', 'JURISDICTION_CORRECTED', 'ADDRESS_UPDATED', 'QUOTE_REASSIGNED', 'JOB_REASSIGNED', 'REVIEW_STATUS_CHANGED', 'AI_VALUE_ACCEPTED', 'AI_VALUE_REJECTED', 'AI_VALUE_REPLACED');

-- AlterTable
ALTER TABLE "CustomerServiceLocation" ADD COLUMN     "apn" TEXT,
ADD COLUMN     "detailsLastChecked" TIMESTAMP(3),
ADD COLUMN     "detailsReviewedAt" TIMESTAMP(3),
ADD COLUMN     "detailsReviewedBy" TEXT,
ADD COLUMN     "detailsSource" "SiteDetailsSource" NOT NULL DEFAULT 'DATABASE_MATCH',
ADD COLUMN     "detailsStatus" "SiteDetailsStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "jurisdictionId" TEXT,
ADD COLUMN     "utilityId" TEXT;

-- CreateTable
CREATE TABLE "Utility" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "utilityType" "UtilityType" NOT NULL DEFAULT 'ELECTRIC',
    "officialWebsite" TEXT,
    "serviceUpgradeUrl" TEXT,
    "applicationPortalUrl" TEXT,
    "disconnectReconnectUrl" TEXT,
    "officialSourceUrl" TEXT,
    "officialSourceTitle" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastResearchedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Utility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilityCoverage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "utilityId" TEXT NOT NULL,
    "coverageType" "UtilityCoverageType" NOT NULL DEFAULT 'ZIP',
    "coverageValue" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT,
    "county" TEXT,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "confidence" "CoverageConfidence" NOT NULL DEFAULT 'MEDIUM',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UtilityCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdictionType" "JurisdictionType" NOT NULL,
    "state" TEXT NOT NULL,
    "county" TEXT,
    "officialWebsite" TEXT,
    "buildingDepartmentName" TEXT,
    "buildingDepartmentUrl" TEXT,
    "permitPortalUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastResearchedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Jurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountyAssessorResource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "assessorSearchUrl" TEXT NOT NULL,
    "parcelGisUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastResearchedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountyAssessorResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDetailsReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceLocationId" TEXT NOT NULL,
    "status" "SiteDetailsStatus" NOT NULL DEFAULT 'USER_REVIEWED',
    "source" "SiteDetailsSource" NOT NULL DEFAULT 'USER_REVIEWED',
    "notes" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDetailsReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceLocationAuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "serviceLocationId" TEXT NOT NULL,
    "eventType" "ServiceLocationAuditType" NOT NULL,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "sourceReason" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceLocationAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Utility_organizationId_idx" ON "Utility"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Utility_organizationId_name_key" ON "Utility"("organizationId", "name");

-- CreateIndex
CREATE INDEX "UtilityCoverage_organizationId_idx" ON "UtilityCoverage"("organizationId");

-- CreateIndex
CREATE INDEX "UtilityCoverage_utilityId_idx" ON "UtilityCoverage"("utilityId");

-- CreateIndex
CREATE INDEX "UtilityCoverage_organizationId_coverageType_coverageValue_s_idx" ON "UtilityCoverage"("organizationId", "coverageType", "coverageValue", "state");

-- CreateIndex
CREATE INDEX "Jurisdiction_organizationId_idx" ON "Jurisdiction"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_organizationId_name_state_jurisdictionType_key" ON "Jurisdiction"("organizationId", "name", "state", "jurisdictionType");

-- CreateIndex
CREATE INDEX "CountyAssessorResource_organizationId_idx" ON "CountyAssessorResource"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CountyAssessorResource_organizationId_county_state_key" ON "CountyAssessorResource"("organizationId", "county", "state");

-- CreateIndex
CREATE INDEX "SiteDetailsReview_organizationId_idx" ON "SiteDetailsReview"("organizationId");

-- CreateIndex
CREATE INDEX "SiteDetailsReview_serviceLocationId_reviewedAt_idx" ON "SiteDetailsReview"("serviceLocationId", "reviewedAt");

-- CreateIndex
CREATE INDEX "ServiceLocationAuditEvent_organizationId_createdAt_idx" ON "ServiceLocationAuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceLocationAuditEvent_serviceLocationId_createdAt_idx" ON "ServiceLocationAuditEvent"("serviceLocationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_utilityId_idx" ON "CustomerServiceLocation"("utilityId");

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_jurisdictionId_idx" ON "CustomerServiceLocation"("jurisdictionId");

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_utilityId_fkey" FOREIGN KEY ("utilityId") REFERENCES "Utility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Utility" ADD CONSTRAINT "Utility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityCoverage" ADD CONSTRAINT "UtilityCoverage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityCoverage" ADD CONSTRAINT "UtilityCoverage_utilityId_fkey" FOREIGN KEY ("utilityId") REFERENCES "Utility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Jurisdiction" ADD CONSTRAINT "Jurisdiction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountyAssessorResource" ADD CONSTRAINT "CountyAssessorResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDetailsReview" ADD CONSTRAINT "SiteDetailsReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDetailsReview" ADD CONSTRAINT "SiteDetailsReview_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "CustomerServiceLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDetailsReview" ADD CONSTRAINT "SiteDetailsReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocationAuditEvent" ADD CONSTRAINT "ServiceLocationAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocationAuditEvent" ADD CONSTRAINT "ServiceLocationAuditEvent_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "CustomerServiceLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceLocationAuditEvent" ADD CONSTRAINT "ServiceLocationAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
