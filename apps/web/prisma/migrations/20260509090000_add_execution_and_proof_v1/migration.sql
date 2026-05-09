-- CreateEnum
CREATE TYPE "JobVisitStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'TASK_COMPLETED';
ALTER TYPE "JobActivityType" ADD VALUE 'ATTACHMENT_UPLOADED';
ALTER TYPE "JobActivityType" ADD VALUE 'VISIT_SCHEDULED';
ALTER TYPE "JobActivityType" ADD VALUE 'VISIT_RESCHEDULED';
ALTER TYPE "JobActivityType" ADD VALUE 'VISIT_CANCELED';
ALTER TYPE "JobActivityType" ADD VALUE 'VISIT_COMPLETED';

-- AlterTable
ALTER TABLE "JobTask" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedByUserId" TEXT,
ADD COLUMN     "completionNote" TEXT,
ADD COLUMN     "completionRequirementsJson" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "TaskTemplate" ADD COLUMN     "requirementsJson" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "LineItemTemplateTask" ADD COLUMN     "requirementsJson" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "QuoteLineExecutionTask" ADD COLUMN     "requirementsJson" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "JobVisit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3),
    "status" "JobVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "assignedUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "leadId" TEXT,
    "quoteId" TEXT,
    "jobId" TEXT,
    "jobTaskId" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobVisit_organizationId_idx" ON "JobVisit"("organizationId");
CREATE INDEX "JobVisit_jobId_idx" ON "JobVisit"("jobId");
CREATE INDEX "JobVisit_assignedUserId_idx" ON "JobVisit"("assignedUserId");
CREATE INDEX "JobVisit_status_idx" ON "JobVisit"("status");
CREATE INDEX "JobVisit_scheduledStartAt_idx" ON "JobVisit"("scheduledStartAt");

-- CreateIndex
CREATE INDEX "Attachment_organizationId_idx" ON "Attachment"("organizationId");
CREATE INDEX "Attachment_leadId_idx" ON "Attachment"("leadId");
CREATE INDEX "Attachment_quoteId_idx" ON "Attachment"("quoteId");
CREATE INDEX "Attachment_jobId_idx" ON "Attachment"("jobId");
CREATE INDEX "Attachment_jobTaskId_idx" ON "Attachment"("jobTaskId");

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobVisit" ADD CONSTRAINT "JobVisit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobVisit" ADD CONSTRAINT "JobVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JobVisit" ADD CONSTRAINT "JobVisit_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobTaskId_fkey" FOREIGN KEY ("jobTaskId") REFERENCES "JobTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
