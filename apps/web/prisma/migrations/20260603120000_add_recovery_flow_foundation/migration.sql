-- Recovery flow foundation (issue-driven task sequences on jobs).

-- CreateEnum
CREATE TYPE "JobRecoveryFlowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "JobActivityType" ADD VALUE 'RECOVERY_FLOW_CREATED';
ALTER TYPE "JobActivityType" ADD VALUE 'RECOVERY_FLOW_ACTIVATED';
ALTER TYPE "JobActivityType" ADD VALUE 'RECOVERY_FLOW_COMPLETED';

-- DropIndex
DROP INDEX IF EXISTS "JobTask_sourceJobIssueId_key";

-- AlterTable
ALTER TABLE "JobTask" ADD COLUMN "recoveryFlowId" TEXT,
ADD COLUMN "recoveryFlowOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "JobRecoveryFlow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobIssueId" TEXT NOT NULL,
    "status" "JobRecoveryFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceFailedTaskId" TEXT,
    "sourceChecklistItemId" TEXT,
    "sourcePermitEventId" TEXT,
    "sourceInspectionEventId" TEXT,

    CONSTRAINT "JobRecoveryFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobRecoveryFlow_jobIssueId_key" ON "JobRecoveryFlow"("jobIssueId");

-- CreateIndex
CREATE INDEX "JobRecoveryFlow_organizationId_idx" ON "JobRecoveryFlow"("organizationId");

-- CreateIndex
CREATE INDEX "JobRecoveryFlow_jobId_idx" ON "JobRecoveryFlow"("jobId");

-- CreateIndex
CREATE INDEX "JobRecoveryFlow_jobIssueId_idx" ON "JobRecoveryFlow"("jobIssueId");

-- CreateIndex
CREATE INDEX "JobTask_recoveryFlowId_idx" ON "JobTask"("recoveryFlowId");

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_recoveryFlowId_fkey" FOREIGN KEY ("recoveryFlowId") REFERENCES "JobRecoveryFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecoveryFlow" ADD CONSTRAINT "JobRecoveryFlow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecoveryFlow" ADD CONSTRAINT "JobRecoveryFlow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecoveryFlow" ADD CONSTRAINT "JobRecoveryFlow_jobIssueId_fkey" FOREIGN KEY ("jobIssueId") REFERENCES "JobIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
