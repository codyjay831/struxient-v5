-- CreateEnum
CREATE TYPE "BusinessProfileTrade" AS ENUM ('ELECTRICAL', 'SOLAR', 'ROOFING', 'HVAC', 'PLUMBING', 'GENERAL_CONTRACTING', 'REMODELING', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessProfileWorkType" AS ENUM ('SERVICE_REPAIR', 'REPLACEMENT', 'INSTALLATION', 'REMODEL', 'NEW_CONSTRUCTION', 'MAINTENANCE', 'MULTI_STEP_PROJECTS', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessProfileCustomerMarket" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'PROPERTY_MANAGERS', 'BUILDERS_GENERAL_CONTRACTORS', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessProfileOperatingModel" AS ENUM ('OWNER_OPERATOR', 'EMPLOYEES', 'SUBCONTRACTORS', 'EMPLOYEES_AND_SUBCONTRACTORS');

-- CreateEnum
CREATE TYPE "BusinessProfileTeamSize" AS ENUM ('JUST_ME', 'TWO_TO_FIVE', 'SIX_TO_FIFTEEN', 'SIXTEEN_TO_FIFTY', 'FIFTY_ONE_PLUS');

-- CreateTable
CREATE TABLE "OrganizationBusinessProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "trades" "BusinessProfileTrade"[] DEFAULT ARRAY[]::"BusinessProfileTrade"[],
    "workTypes" "BusinessProfileWorkType"[] DEFAULT ARRAY[]::"BusinessProfileWorkType"[],
    "customerMarkets" "BusinessProfileCustomerMarket"[] DEFAULT ARRAY[]::"BusinessProfileCustomerMarket"[],
    "operatingModel" "BusinessProfileOperatingModel",
    "teamSize" "BusinessProfileTeamSize",
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBusinessProfile_organizationId_key" ON "OrganizationBusinessProfile"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationBusinessProfile_updatedByUserId_idx" ON "OrganizationBusinessProfile"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "OrganizationBusinessProfile" ADD CONSTRAINT "OrganizationBusinessProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationBusinessProfile" ADD CONSTRAINT "OrganizationBusinessProfile_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
