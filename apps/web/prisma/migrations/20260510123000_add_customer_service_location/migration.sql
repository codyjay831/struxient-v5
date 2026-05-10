-- CreateEnum
CREATE TYPE "CustomerServiceLocationSource" AS ENUM ('google_places', 'manual');

-- CreateTable
CREATE TABLE "CustomerServiceLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdFromLeadId" TEXT,
    "formattedAddress" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL DEFAULT '',
    "addressLine2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "googlePlaceId" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "source" "CustomerServiceLocationSource" NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerServiceLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_organizationId_idx" ON "CustomerServiceLocation"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_customerId_idx" ON "CustomerServiceLocation"("customerId");

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_customerId_isPrimary_idx" ON "CustomerServiceLocation"("customerId", "isPrimary");

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_createdFromLeadId_fkey" FOREIGN KEY ("createdFromLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
