-- CreateEnum
CREATE TYPE "LeadVisitPurpose" AS ENUM ('INITIAL_DISCOVERY', 'MEASUREMENTS', 'SCOPE_VERIFICATION', 'REVISION_VERIFICATION', 'OTHER');

-- AlterEnum
ALTER TYPE "LeadVisitRequestStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "LeadVisitRequestStatus" ADD VALUE 'NO_SHOW';

-- AlterTable
ALTER TABLE "LeadVisitRequest" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedByUserId" TEXT,
ADD COLUMN     "completionNotes" TEXT,
ADD COLUMN     "purpose" "LeadVisitPurpose",
ADD COLUMN     "scheduledEndAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuoteChangeRequest" ADD COLUMN     "requiresVisit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resultingQuoteId" TEXT;

-- AddForeignKey
ALTER TABLE "QuoteChangeRequest" ADD CONSTRAINT "QuoteChangeRequest_resultingQuoteId_fkey" FOREIGN KEY ("resultingQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVisitRequest" ADD CONSTRAINT "LeadVisitRequest_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
