-- Phase 2: optional work-group layer for production scheduling.
CREATE TABLE "JobWorkPackage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "workType" TEXT,
  "plannedStartDate" TIMESTAMP(3),
  "plannedEndDate" TIMESTAMP(3),
  "source" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "JobWorkPackage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "JobTask"
ADD COLUMN "workPackageId" TEXT;

CREATE INDEX "JobWorkPackage_organizationId_idx"
ON "JobWorkPackage"("organizationId");

CREATE INDEX "JobWorkPackage_jobId_idx"
ON "JobWorkPackage"("jobId");

CREATE INDEX "JobWorkPackage_jobId_displayOrder_idx"
ON "JobWorkPackage"("jobId", "displayOrder");

CREATE INDEX "JobTask_workPackageId_idx"
ON "JobTask"("workPackageId");

ALTER TABLE "JobWorkPackage"
ADD CONSTRAINT "JobWorkPackage_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobWorkPackage"
ADD CONSTRAINT "JobWorkPackage_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobTask"
ADD CONSTRAINT "JobTask_workPackageId_fkey"
FOREIGN KEY ("workPackageId") REFERENCES "JobWorkPackage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
