-- CreateEnum
CREATE TYPE "JobPaymentRequirementStatus" AS ENUM ('PENDING', 'DUE', 'PAID', 'WAIVED', 'CANCELED');

-- CreateTable
CREATE TABLE "JobPaymentRequirement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER,
    "status" "JobPaymentRequirementStatus" NOT NULL DEFAULT 'PENDING',
    "requiredBeforeStageId" TEXT,
    "paidAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPaymentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPaymentRequirement_organizationId_idx" ON "JobPaymentRequirement"("organizationId");
CREATE INDEX "JobPaymentRequirement_jobId_idx" ON "JobPaymentRequirement"("jobId");
CREATE INDEX "JobPaymentRequirement_organizationId_status_idx" ON "JobPaymentRequirement"("organizationId", "status");
CREATE INDEX "JobPaymentRequirement_requiredBeforeStageId_idx" ON "JobPaymentRequirement"("requiredBeforeStageId");

-- AddForeignKey
ALTER TABLE "JobPaymentRequirement" ADD CONSTRAINT "JobPaymentRequirement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPaymentRequirement" ADD CONSTRAINT "JobPaymentRequirement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobPaymentRequirement" ADD CONSTRAINT "JobPaymentRequirement_requiredBeforeStageId_fkey" FOREIGN KEY ("requiredBeforeStageId") REFERENCES "JobStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
