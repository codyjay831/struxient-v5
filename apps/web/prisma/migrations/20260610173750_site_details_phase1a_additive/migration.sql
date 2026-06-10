-- DropForeignKey
ALTER TABLE "CustomerServiceLocation" DROP CONSTRAINT "CustomerServiceLocation_customerId_fkey";

-- AlterTable
ALTER TABLE "CustomerServiceLocation" ADD COLUMN     "addressFingerprint" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "staleAt" TIMESTAMP(3),
ADD COLUMN     "staleReason" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "serviceLocationId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "serviceLocationId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "serviceLocationId" TEXT;

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_organizationId_addressFingerprint_idx" ON "CustomerServiceLocation"("organizationId", "addressFingerprint");

-- CreateIndex
CREATE INDEX "CustomerServiceLocation_organizationId_googlePlaceId_idx" ON "CustomerServiceLocation"("organizationId", "googlePlaceId");

-- CreateIndex
CREATE INDEX "Job_serviceLocationId_idx" ON "Job"("serviceLocationId");

-- CreateIndex
CREATE INDEX "Lead_serviceLocationId_idx" ON "Lead"("serviceLocationId");

-- CreateIndex
CREATE INDEX "Quote_serviceLocationId_idx" ON "Quote"("serviceLocationId");

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "CustomerServiceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "CustomerServiceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_serviceLocationId_fkey" FOREIGN KEY ("serviceLocationId") REFERENCES "CustomerServiceLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
