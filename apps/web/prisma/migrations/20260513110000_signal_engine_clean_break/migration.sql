-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobActivityType" ADD VALUE 'EVENT_CREATED';
ALTER TYPE "JobActivityType" ADD VALUE 'EVENT_RESOLVED';

-- AlterEnum
BEGIN;
CREATE TYPE "JobTaskStatus_new" AS ENUM ('TODO', 'DONE');
ALTER TABLE "public"."JobTask" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "JobTask" ALTER COLUMN "status" TYPE "JobTaskStatus_new" USING ("status"::text::"JobTaskStatus_new");
ALTER TYPE "JobTaskStatus" RENAME TO "JobTaskStatus_old";
ALTER TYPE "JobTaskStatus_new" RENAME TO "JobTaskStatus";
DROP TYPE "public"."JobTaskStatus_old";
ALTER TABLE "JobTask" ALTER COLUMN "status" SET DEFAULT 'TODO';
COMMIT;

-- DropIndex
DROP INDEX "LineItemTemplateTask_lineItemTemplateId_stageKey_sortOrder_idx";

-- DropIndex
DROP INDEX "QuoteLineExecutionTask_quoteLineItemId_stageKey_sortOrder_idx";

-- DropIndex
DROP INDEX "QuoteLineItem_quoteId_executionOrder_idx";

-- AlterTable
ALTER TABLE "JobStage" DROP COLUMN "blockSortOrder",
DROP COLUMN "blockTitle",
DROP COLUMN "blockType",
DROP COLUMN "stageKey",
ADD COLUMN     "providesSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "JobTask" DROP COLUMN "stageKey",
ADD COLUMN     "actualMinutes" INTEGER,
ADD COLUMN     "assigneeRole" "StaffRole",
ADD COLUMN     "costBudgetCents" INTEGER,
ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "hardSignal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partsRequiredJson" JSONB,
ADD COLUMN     "providesSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "LineItemTemplateTask" DROP COLUMN "stageKey",
ADD COLUMN     "assigneeRole" "StaffRole",
ADD COLUMN     "costBudgetCents" INTEGER,
ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "hardSignal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partsRequiredJson" JSONB,
ADD COLUMN     "providesSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "QuoteLineExecutionTask" DROP COLUMN "stageKey",
ADD COLUMN     "assigneeRole" "StaffRole",
ADD COLUMN     "costBudgetCents" INTEGER,
ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "hardSignal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partsRequiredJson" JSONB,
ADD COLUMN     "providesSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stageId" TEXT;

-- AlterTable
ALTER TABLE "QuoteLineItem" DROP COLUMN "executionMergeMode",
DROP COLUMN "executionOrder",
DROP COLUMN "executionReviewStatus";

-- AlterTable
ALTER TABLE "TaskTemplate" DROP COLUMN "stageKey",
ADD COLUMN     "assigneeRole" "StaffRole",
ADD COLUMN     "costBudgetCents" INTEGER,
ADD COLUMN     "estimatedMinutes" INTEGER,
ADD COLUMN     "hardSignal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partsRequiredJson" JSONB,
ADD COLUMN     "providesSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "requiresSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "stageId" TEXT;

-- DropEnum
DROP TYPE "ExecutionStageKey";

-- DropEnum
DROP TYPE "JobStageBlockType";

-- DropEnum
DROP TYPE "QuoteLineExecutionMergeMode";

-- DropEnum
DROP TYPE "QuoteLineExecutionReviewStatus";

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSignal" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceJobTaskId" TEXT,
    "sourceJobStageId" TEXT,

    CONSTRAINT "JobSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Stage_organizationId_idx" ON "Stage"("organizationId");

-- CreateIndex
CREATE INDEX "Stage_organizationId_sortOrder_idx" ON "Stage"("organizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "JobSignal_jobId_idx" ON "JobSignal"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSignal_jobId_name_key" ON "JobSignal"("jobId", "name");

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItemTemplateTask" ADD CONSTRAINT "LineItemTemplateTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLineExecutionTask" ADD CONSTRAINT "QuoteLineExecutionTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSignal" ADD CONSTRAINT "JobSignal_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStage" ADD CONSTRAINT "JobStage_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
