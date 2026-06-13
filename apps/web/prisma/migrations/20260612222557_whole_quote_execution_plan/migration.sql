-- CreateEnum
CREATE TYPE "QuoteExecutionPlanStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "ExecutionTaskOrigin" AS ENUM ('AI_PLAN', 'TEMPLATE_COPY', 'MANUAL', 'SCOPE_REVISION', 'ISSUE_RECOVERY');

-- CreateEnum
CREATE TYPE "ExecutionPlanRevisionKind" AS ENUM ('INITIAL_PLAN', 'SCOPE_RECONCILIATION');

-- CreateEnum
CREATE TYPE "ExecutionPlanRevisionStatus" AS ENUM ('DRAFT', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "QuoteScopeRevisionStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuoteScopeRevisionLineOperation" AS ENUM ('ADD', 'MODIFY', 'REMOVE');

-- CreateEnum
CREATE TYPE "JobScopeItemStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'REMOVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobActivityType" ADD VALUE 'TASK_CANCELED';
ALTER TYPE "JobActivityType" ADD VALUE 'SCOPE_REVISION_APPLIED';

-- AlterEnum
ALTER TYPE "JobTaskStatus" ADD VALUE 'CANCELED';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "jobPlanVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "JobPaymentRequirement" ADD COLUMN     "sourceQuoteScopeRevisionId" TEXT;

-- AlterTable
ALTER TABLE "JobTask" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "canceledByUserId" TEXT,
ADD COLUMN     "canceledReason" TEXT,
ADD COLUMN     "origin" "ExecutionTaskOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "planningTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sourcePlanRevisionId" TEXT,
ADD COLUMN     "sourceQuoteExecutionTaskId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "revisionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "revisionOfQuoteId" TEXT;

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN     "executionRelevant" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "QuoteExecutionPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "QuoteExecutionPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "planVersion" INTEGER NOT NULL DEFAULT 1,
    "planningInputHash" TEXT,
    "planningInputSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteExecutionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteExecutionTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteExecutionPlanId" TEXT NOT NULL,
    "sourceLineItemTemplateTaskId" TEXT,
    "sourceTaskTemplateId" TEXT,
    "sourceType" "LineItemTemplateTaskSource" NOT NULL,
    "origin" "ExecutionTaskOrigin" NOT NULL DEFAULT 'MANUAL',
    "title" TEXT NOT NULL,
    "category" "TaskTemplateCategory" NOT NULL,
    "instructions" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "humanEditedAt" TIMESTAMP(3),
    "protectedAt" TIMESTAMP(3),
    "createdByPlanRevisionId" TEXT,
    "requirementsJson" JSONB NOT NULL DEFAULT '{}',
    "assigneeRole" "StaffRole",
    "costBudgetCents" INTEGER,
    "estimatedMinutes" INTEGER,
    "hardSignal" BOOLEAN NOT NULL DEFAULT false,
    "partsRequiredJson" JSONB,
    "providesSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiresSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "planningTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stageId" TEXT,

    CONSTRAINT "QuoteExecutionTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteExecutionTaskScope" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteExecutionTaskId" TEXT NOT NULL,
    "quoteLineItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteExecutionTaskScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionPlanRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "jobId" TEXT,
    "quoteScopeRevisionId" TEXT,
    "kind" "ExecutionPlanRevisionKind" NOT NULL,
    "status" "ExecutionPlanRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "basePlanVersion" INTEGER NOT NULL,
    "resultingPlanVersion" INTEGER,
    "proposalJson" JSONB NOT NULL,
    "proposalSchemaVersion" INTEGER NOT NULL,
    "plannerVersion" TEXT NOT NULL,
    "modelProviderMeta" JSONB,
    "planningInputHash" TEXT,
    "reasoningSummary" TEXT,
    "approvedByUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionPlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteScopeRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "QuoteScopeRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "reasoning" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteScopeRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteScopeRevisionLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteScopeRevisionId" TEXT NOT NULL,
    "operation" "QuoteScopeRevisionLineOperation" NOT NULL,
    "sourceJobScopeItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPriceCents" INTEGER,
    "priceDeltaCents" INTEGER,
    "executionRelevant" BOOLEAN NOT NULL DEFAULT true,
    "scopeDataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteScopeRevisionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobScopeItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sourceQuoteLineItemId" TEXT,
    "sourceQuoteScopeRevisionLineId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPriceCents" INTEGER,
    "executionRelevant" BOOLEAN NOT NULL DEFAULT true,
    "status" "JobScopeItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededByJobScopeItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobScopeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobTaskScope" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobTaskId" TEXT NOT NULL,
    "jobScopeItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobTaskScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteExecutionPlan_quoteId_key" ON "QuoteExecutionPlan"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteExecutionPlan_organizationId_idx" ON "QuoteExecutionPlan"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteExecutionPlan_status_idx" ON "QuoteExecutionPlan"("status");

-- CreateIndex
CREATE INDEX "QuoteExecutionTask_organizationId_idx" ON "QuoteExecutionTask"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteExecutionTask_quoteExecutionPlanId_sortOrder_idx" ON "QuoteExecutionTask"("quoteExecutionPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuoteExecutionTask_createdByPlanRevisionId_idx" ON "QuoteExecutionTask"("createdByPlanRevisionId");

-- CreateIndex
CREATE INDEX "QuoteExecutionTaskScope_organizationId_idx" ON "QuoteExecutionTaskScope"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteExecutionTaskScope_quoteLineItemId_idx" ON "QuoteExecutionTaskScope"("quoteLineItemId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteExecutionTaskScope_quoteExecutionTaskId_quoteLineItemI_key" ON "QuoteExecutionTaskScope"("quoteExecutionTaskId", "quoteLineItemId");

-- CreateIndex
CREATE INDEX "ExecutionPlanRevision_organizationId_idx" ON "ExecutionPlanRevision"("organizationId");

-- CreateIndex
CREATE INDEX "ExecutionPlanRevision_quoteId_idx" ON "ExecutionPlanRevision"("quoteId");

-- CreateIndex
CREATE INDEX "ExecutionPlanRevision_jobId_idx" ON "ExecutionPlanRevision"("jobId");

-- CreateIndex
CREATE INDEX "ExecutionPlanRevision_quoteScopeRevisionId_idx" ON "ExecutionPlanRevision"("quoteScopeRevisionId");

-- CreateIndex
CREATE INDEX "QuoteScopeRevision_organizationId_idx" ON "QuoteScopeRevision"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteScopeRevision_quoteId_idx" ON "QuoteScopeRevision"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteScopeRevision_jobId_idx" ON "QuoteScopeRevision"("jobId");

-- CreateIndex
CREATE INDEX "QuoteScopeRevisionLine_organizationId_idx" ON "QuoteScopeRevisionLine"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteScopeRevisionLine_quoteScopeRevisionId_idx" ON "QuoteScopeRevisionLine"("quoteScopeRevisionId");

-- CreateIndex
CREATE INDEX "QuoteScopeRevisionLine_sourceJobScopeItemId_idx" ON "QuoteScopeRevisionLine"("sourceJobScopeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "JobScopeItem_supersededByJobScopeItemId_key" ON "JobScopeItem"("supersededByJobScopeItemId");

-- CreateIndex
CREATE INDEX "JobScopeItem_organizationId_idx" ON "JobScopeItem"("organizationId");

-- CreateIndex
CREATE INDEX "JobScopeItem_jobId_idx" ON "JobScopeItem"("jobId");

-- CreateIndex
CREATE INDEX "JobScopeItem_sourceQuoteLineItemId_idx" ON "JobScopeItem"("sourceQuoteLineItemId");

-- CreateIndex
CREATE INDEX "JobScopeItem_sourceQuoteScopeRevisionLineId_idx" ON "JobScopeItem"("sourceQuoteScopeRevisionLineId");

-- CreateIndex
CREATE INDEX "JobTaskScope_organizationId_idx" ON "JobTaskScope"("organizationId");

-- CreateIndex
CREATE INDEX "JobTaskScope_jobScopeItemId_idx" ON "JobTaskScope"("jobScopeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "JobTaskScope_jobTaskId_jobScopeItemId_key" ON "JobTaskScope"("jobTaskId", "jobScopeItemId");

-- CreateIndex
CREATE INDEX "JobPaymentRequirement_sourceQuoteScopeRevisionId_idx" ON "JobPaymentRequirement"("sourceQuoteScopeRevisionId");

-- CreateIndex
CREATE INDEX "JobTask_sourceQuoteExecutionTaskId_idx" ON "JobTask"("sourceQuoteExecutionTaskId");

-- CreateIndex
CREATE INDEX "Quote_revisionOfQuoteId_idx" ON "Quote"("revisionOfQuoteId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_revisionOfQuoteId_fkey" FOREIGN KEY ("revisionOfQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionPlan" ADD CONSTRAINT "QuoteExecutionPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionPlan" ADD CONSTRAINT "QuoteExecutionPlan_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionPlan" ADD CONSTRAINT "QuoteExecutionPlan_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTask" ADD CONSTRAINT "QuoteExecutionTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTask" ADD CONSTRAINT "QuoteExecutionTask_quoteExecutionPlanId_fkey" FOREIGN KEY ("quoteExecutionPlanId") REFERENCES "QuoteExecutionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTask" ADD CONSTRAINT "QuoteExecutionTask_sourceLineItemTemplateTaskId_fkey" FOREIGN KEY ("sourceLineItemTemplateTaskId") REFERENCES "LineItemTemplateTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTask" ADD CONSTRAINT "QuoteExecutionTask_sourceTaskTemplateId_fkey" FOREIGN KEY ("sourceTaskTemplateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTask" ADD CONSTRAINT "QuoteExecutionTask_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTaskScope" ADD CONSTRAINT "QuoteExecutionTaskScope_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTaskScope" ADD CONSTRAINT "QuoteExecutionTaskScope_quoteExecutionTaskId_fkey" FOREIGN KEY ("quoteExecutionTaskId") REFERENCES "QuoteExecutionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteExecutionTaskScope" ADD CONSTRAINT "QuoteExecutionTaskScope_quoteLineItemId_fkey" FOREIGN KEY ("quoteLineItemId") REFERENCES "QuoteLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlanRevision" ADD CONSTRAINT "ExecutionPlanRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlanRevision" ADD CONSTRAINT "ExecutionPlanRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlanRevision" ADD CONSTRAINT "ExecutionPlanRevision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlanRevision" ADD CONSTRAINT "ExecutionPlanRevision_quoteScopeRevisionId_fkey" FOREIGN KEY ("quoteScopeRevisionId") REFERENCES "QuoteScopeRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionPlanRevision" ADD CONSTRAINT "ExecutionPlanRevision_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevision" ADD CONSTRAINT "QuoteScopeRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevision" ADD CONSTRAINT "QuoteScopeRevision_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevision" ADD CONSTRAINT "QuoteScopeRevision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevision" ADD CONSTRAINT "QuoteScopeRevision_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevisionLine" ADD CONSTRAINT "QuoteScopeRevisionLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevisionLine" ADD CONSTRAINT "QuoteScopeRevisionLine_quoteScopeRevisionId_fkey" FOREIGN KEY ("quoteScopeRevisionId") REFERENCES "QuoteScopeRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteScopeRevisionLine" ADD CONSTRAINT "QuoteScopeRevisionLine_sourceJobScopeItemId_fkey" FOREIGN KEY ("sourceJobScopeItemId") REFERENCES "JobScopeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTask" ADD CONSTRAINT "JobTask_sourceQuoteExecutionTaskId_fkey" FOREIGN KEY ("sourceQuoteExecutionTaskId") REFERENCES "QuoteExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScopeItem" ADD CONSTRAINT "JobScopeItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScopeItem" ADD CONSTRAINT "JobScopeItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScopeItem" ADD CONSTRAINT "JobScopeItem_sourceQuoteLineItemId_fkey" FOREIGN KEY ("sourceQuoteLineItemId") REFERENCES "QuoteLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScopeItem" ADD CONSTRAINT "JobScopeItem_sourceQuoteScopeRevisionLineId_fkey" FOREIGN KEY ("sourceQuoteScopeRevisionLineId") REFERENCES "QuoteScopeRevisionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobScopeItem" ADD CONSTRAINT "JobScopeItem_supersededByJobScopeItemId_fkey" FOREIGN KEY ("supersededByJobScopeItemId") REFERENCES "JobScopeItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTaskScope" ADD CONSTRAINT "JobTaskScope_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTaskScope" ADD CONSTRAINT "JobTaskScope_jobTaskId_fkey" FOREIGN KEY ("jobTaskId") REFERENCES "JobTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobTaskScope" ADD CONSTRAINT "JobTaskScope_jobScopeItemId_fkey" FOREIGN KEY ("jobScopeItemId") REFERENCES "JobScopeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPaymentRequirement" ADD CONSTRAINT "JobPaymentRequirement_sourceQuoteScopeRevisionId_fkey" FOREIGN KEY ("sourceQuoteScopeRevisionId") REFERENCES "QuoteScopeRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
