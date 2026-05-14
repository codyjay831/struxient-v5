-- AlterTable
ALTER TABLE "JobPaymentRequirement" ADD COLUMN "sourcePaymentScheduleItemId" TEXT;

-- CreateIndex
CREATE INDEX "JobPaymentRequirement_sourcePaymentScheduleItemId_idx" ON "JobPaymentRequirement"("sourcePaymentScheduleItemId");
