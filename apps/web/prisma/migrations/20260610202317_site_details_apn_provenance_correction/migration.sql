-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceLocationAuditType" ADD VALUE 'APN_CONFIRMED';
ALTER TYPE "ServiceLocationAuditType" ADD VALUE 'APN_CONFLICT_DETECTED';
ALTER TYPE "ServiceLocationAuditType" ADD VALUE 'APN_CLEARED';
ALTER TYPE "ServiceLocationAuditType" ADD VALUE 'APN_MARKED_STALE';

-- AlterTable
ALTER TABLE "CustomerServiceLocation" ADD COLUMN     "apnConflictDetectedAt" TIMESTAMP(3),
ADD COLUMN     "apnConflictSourceTitle" TEXT,
ADD COLUMN     "apnConflictSourceUrl" TEXT,
ADD COLUMN     "apnConflictValue" TEXT,
ADD COLUMN     "apnDiscoveredAt" TIMESTAMP(3),
ADD COLUMN     "apnResearchUsageLogId" TEXT,
ADD COLUMN     "apnSourceTitle" TEXT,
ADD COLUMN     "apnSourceUrl" TEXT,
ADD COLUMN     "apnVerificationUrl" TEXT;
