-- CreateEnum
CREATE TYPE "ExecutionStageKey" AS ENUM ('intake_review', 'site_visit', 'pre_install', 'permitting', 'materials', 'installation', 'inspection', 'corrections', 'closeout');

-- CreateEnum
CREATE TYPE "TaskTemplateCategory" AS ENUM ('GENERAL', 'PERMIT', 'INSPECTION', 'MATERIAL', 'PAYMENT', 'CUSTOMER_COMMUNICATION', 'PHOTO_EVIDENCE', 'SCHEDULING');

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stageKey" "ExecutionStageKey" NOT NULL,
    "category" "TaskTemplateCategory" NOT NULL,
    "instructions" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTemplate_organizationId_idx" ON "TaskTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "TaskTemplate_organizationId_archivedAt_idx" ON "TaskTemplate"("organizationId", "archivedAt");

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
