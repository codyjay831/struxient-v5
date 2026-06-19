-- CreateEnum
CREATE TYPE "LeadVisitOutcome" AS ENUM ('QUOTE_READY', 'QUOTE_NEEDS_REVISION', 'MISSING_INFORMATION', 'FOLLOW_UP_NEEDED', 'CUSTOMER_NO_SHOW', 'CONTRACTOR_MISSED', 'RESCHEDULE_NEEDED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "LeadVisitNextAction" AS ENUM ('START_QUOTE', 'OPEN_OR_REVISE_QUOTE', 'COLLECT_MISSING_INFO', 'FOLLOW_UP_CUSTOMER', 'SCHEDULE_ANOTHER_VISIT', 'CLOSE_OR_DISQUALIFY', 'NONE_REQUIRED');

-- AlterTable
ALTER TABLE "LeadVisitRequest" ADD COLUMN     "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN     "estimatedDurationMinutes" INTEGER,
ADD COLUMN     "arrivalWindowStartAt" TIMESTAMP(3),
ADD COLUMN     "arrivalWindowEndAt" TIMESTAMP(3),
ADD COLUMN     "arrivalWindowLabel" TEXT,
ADD COLUMN     "assignedUserId" TEXT,
ADD COLUMN     "accessSnapshotJson" JSONB,
ADD COLUMN     "siteContactSnapshotJson" JSONB,
ADD COLUMN     "accessDetailsUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "outcome" "LeadVisitOutcome",
ADD COLUMN     "nextAction" "LeadVisitNextAction",
ADD COLUMN     "outcomeSelectedAt" TIMESTAMP(3);

-- Backfill scheduledStartAt from legacy confirmedDate
UPDATE "LeadVisitRequest"
SET "scheduledStartAt" = "confirmedDate"
WHERE "confirmedDate" IS NOT NULL AND "scheduledStartAt" IS NULL;

-- AddForeignKey
ALTER TABLE "LeadVisitRequest" ADD CONSTRAINT "LeadVisitRequest_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "LeadVisitRequest_organizationId_assignedUserId_status_idx" ON "LeadVisitRequest"("organizationId", "assignedUserId", "status");

-- CreateIndex
CREATE INDEX "LeadVisitRequest_organizationId_scheduledStartAt_idx" ON "LeadVisitRequest"("organizationId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "LeadVisitRequest_organizationId_status_scheduledStartAt_idx" ON "LeadVisitRequest"("organizationId", "status", "scheduledStartAt");
