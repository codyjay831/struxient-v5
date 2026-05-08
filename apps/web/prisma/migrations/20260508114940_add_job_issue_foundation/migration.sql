-- CreateEnum
CREATE TYPE "JobIssueType" AS ENUM ('INSPECTION_FAIL', 'MATERIAL_DELAY', 'SITE_CONDITION', 'CUSTOMER_CHANGE', 'WEATHER', 'SCHEDULE_SLIP', 'PAYMENT_BLOCK', 'SCOPE_CLARIFICATION', 'INTERNAL_ERROR', 'OTHER');

-- CreateEnum
CREATE TYPE "JobIssueSeverity" AS ENUM ('BLOCKS_WORK', 'DOES_NOT_BLOCK');

-- CreateEnum
CREATE TYPE "JobIssueStatus" AS ENUM ('OPEN', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "JobIssue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobStageId" TEXT,
    "jobTaskId" TEXT,
    "createdByUserId" TEXT,
    "type" "JobIssueType" NOT NULL,
    "severity" "JobIssueSeverity" NOT NULL DEFAULT 'BLOCKS_WORK',
    "status" "JobIssueStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobIssue_organizationId_idx" ON "JobIssue"("organizationId");

-- CreateIndex
CREATE INDEX "JobIssue_jobId_idx" ON "JobIssue"("jobId");

-- CreateIndex
CREATE INDEX "JobIssue_organizationId_status_idx" ON "JobIssue"("organizationId", "status");

-- CreateIndex
CREATE INDEX "JobIssue_organizationId_severity_idx" ON "JobIssue"("organizationId", "severity");

-- CreateIndex
CREATE INDEX "JobIssue_jobTaskId_idx" ON "JobIssue"("jobTaskId");

-- CreateIndex
CREATE INDEX "JobIssue_jobStageId_idx" ON "JobIssue"("jobStageId");

-- AddForeignKey
ALTER TABLE "JobIssue" ADD CONSTRAINT "JobIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobIssue" ADD CONSTRAINT "JobIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobIssue" ADD CONSTRAINT "JobIssue_jobStageId_fkey" FOREIGN KEY ("jobStageId") REFERENCES "JobStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobIssue" ADD CONSTRAINT "JobIssue_jobTaskId_fkey" FOREIGN KEY ("jobTaskId") REFERENCES "JobTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobIssue" ADD CONSTRAINT "JobIssue_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
