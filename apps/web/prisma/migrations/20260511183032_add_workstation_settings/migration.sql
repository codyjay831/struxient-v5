/*
  Warnings:

  - You are about to drop the column `leadId` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `createdFromLeadId` on the `CustomerServiceLocation` table. All the data in the column will be lost.
  - You are about to drop the column `leadId` on the `Job` table. All the data in the column will be lost.
  - You are about to drop the column `leadId` on the `Quote` table. All the data in the column will be lost.
  - You are about to drop the `Lead` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeadCustomFieldDef` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeadCustomFieldValue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeadVisitRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SalesIntakeStatus" AS ENUM ('OPEN', 'QUALIFYING', 'CONVERTED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SalesIntakeSource" AS ENUM ('PHONE', 'EMAIL', 'SMS', 'WEBSITE', 'PUBLIC_REQUEST_LINK', 'REFERRAL', 'WALK_IN', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "SalesVisitRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SalesCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'SELECT');

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_leadId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerServiceLocation" DROP CONSTRAINT "CustomerServiceLocation_createdFromLeadId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_leadId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "LeadCustomFieldDef" DROP CONSTRAINT "LeadCustomFieldDef_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "LeadCustomFieldValue" DROP CONSTRAINT "LeadCustomFieldValue_fieldDefId_fkey";

-- DropForeignKey
ALTER TABLE "LeadCustomFieldValue" DROP CONSTRAINT "LeadCustomFieldValue_leadId_fkey";

-- DropForeignKey
ALTER TABLE "LeadVisitRequest" DROP CONSTRAINT "LeadVisitRequest_leadId_fkey";

-- DropForeignKey
ALTER TABLE "LeadVisitRequest" DROP CONSTRAINT "LeadVisitRequest_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_leadId_fkey";

-- DropIndex
DROP INDEX "Attachment_leadId_idx";

-- DropIndex
DROP INDEX "Job_leadId_idx";

-- DropIndex
DROP INDEX "Quote_leadId_idx";

-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "leadId",
ADD COLUMN     "salesIntakeId" TEXT;

-- AlterTable
ALTER TABLE "CustomerServiceLocation" DROP COLUMN "createdFromLeadId",
ADD COLUMN     "createdFromSalesIntakeId" TEXT;

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "leadId",
ADD COLUMN     "salesIntakeId" TEXT;

-- AlterTable
ALTER TABLE "Quote" DROP COLUMN "leadId",
ADD COLUMN     "salesIntakeId" TEXT;

-- DropTable
DROP TABLE "Lead";

-- DropTable
DROP TABLE "LeadCustomFieldDef";

-- DropTable
DROP TABLE "LeadCustomFieldValue";

-- DropTable
DROP TABLE "LeadVisitRequest";

-- DropEnum
DROP TYPE "LeadCustomFieldType";

-- DropEnum
DROP TYPE "LeadSource";

-- DropEnum
DROP TYPE "LeadStatus";

-- DropEnum
DROP TYPE "LeadVisitRequestStatus";

-- CreateTable
CREATE TABLE "WorkstationSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "showQuickActions" BOOLEAN NOT NULL DEFAULT true,
    "quickActionsJson" JSONB NOT NULL DEFAULT '["new-intake", "new-quote", "browse-jobs"]',
    "urgentThresholdHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkstationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesIntake" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" "SalesIntakeStatus" NOT NULL DEFAULT 'OPEN',
    "source" "SalesIntakeSource" NOT NULL DEFAULT 'MANUAL',
    "sourceDetail" TEXT,
    "title" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "requestType" TEXT,
    "neededByBucket" "NeededByBucket",
    "neededByDate" TIMESTAMP(3),
    "scopeSummary" TEXT,
    "suggestedTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "publicIntakeServiceLocation" JSONB,
    "publicIntakeClientKey" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesVisitRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "salesIntakeId" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3),
    "requestedWindow" TEXT,
    "confirmedDate" TIMESTAMP(3),
    "status" "SalesVisitRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesVisitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCustomFieldDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SalesCustomFieldType" NOT NULL,
    "optionsJson" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "showOnPublicIntake" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCustomFieldValue" (
    "id" TEXT NOT NULL,
    "salesIntakeId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkstationSettings_organizationId_key" ON "WorkstationSettings"("organizationId");

-- CreateIndex
CREATE INDEX "SalesIntake_organizationId_idx" ON "SalesIntake"("organizationId");

-- CreateIndex
CREATE INDEX "SalesIntake_customerId_idx" ON "SalesIntake"("customerId");

-- CreateIndex
CREATE INDEX "SalesIntake_status_idx" ON "SalesIntake"("status");

-- CreateIndex
CREATE INDEX "SalesIntake_source_idx" ON "SalesIntake"("source");

-- CreateIndex
CREATE UNIQUE INDEX "SalesIntake_organizationId_publicIntakeClientKey_key" ON "SalesIntake"("organizationId", "publicIntakeClientKey");

-- CreateIndex
CREATE INDEX "SalesVisitRequest_organizationId_idx" ON "SalesVisitRequest"("organizationId");

-- CreateIndex
CREATE INDEX "SalesVisitRequest_salesIntakeId_idx" ON "SalesVisitRequest"("salesIntakeId");

-- CreateIndex
CREATE INDEX "SalesVisitRequest_status_idx" ON "SalesVisitRequest"("status");

-- CreateIndex
CREATE INDEX "SalesCustomFieldDef_organizationId_idx" ON "SalesCustomFieldDef"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCustomFieldDef_organizationId_key_key" ON "SalesCustomFieldDef"("organizationId", "key");

-- CreateIndex
CREATE INDEX "SalesCustomFieldValue_salesIntakeId_idx" ON "SalesCustomFieldValue"("salesIntakeId");

-- CreateIndex
CREATE INDEX "SalesCustomFieldValue_fieldDefId_idx" ON "SalesCustomFieldValue"("fieldDefId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCustomFieldValue_salesIntakeId_fieldDefId_key" ON "SalesCustomFieldValue"("salesIntakeId", "fieldDefId");

-- CreateIndex
CREATE INDEX "Attachment_salesIntakeId_idx" ON "Attachment"("salesIntakeId");

-- CreateIndex
CREATE INDEX "Job_salesIntakeId_idx" ON "Job"("salesIntakeId");

-- CreateIndex
CREATE INDEX "Quote_salesIntakeId_idx" ON "Quote"("salesIntakeId");

-- AddForeignKey
ALTER TABLE "WorkstationSettings" ADD CONSTRAINT "WorkstationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerServiceLocation" ADD CONSTRAINT "CustomerServiceLocation_createdFromSalesIntakeId_fkey" FOREIGN KEY ("createdFromSalesIntakeId") REFERENCES "SalesIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIntake" ADD CONSTRAINT "SalesIntake_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesIntake" ADD CONSTRAINT "SalesIntake_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_salesIntakeId_fkey" FOREIGN KEY ("salesIntakeId") REFERENCES "SalesIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_salesIntakeId_fkey" FOREIGN KEY ("salesIntakeId") REFERENCES "SalesIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_salesIntakeId_fkey" FOREIGN KEY ("salesIntakeId") REFERENCES "SalesIntake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVisitRequest" ADD CONSTRAINT "SalesVisitRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesVisitRequest" ADD CONSTRAINT "SalesVisitRequest_salesIntakeId_fkey" FOREIGN KEY ("salesIntakeId") REFERENCES "SalesIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCustomFieldDef" ADD CONSTRAINT "SalesCustomFieldDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCustomFieldValue" ADD CONSTRAINT "SalesCustomFieldValue_salesIntakeId_fkey" FOREIGN KEY ("salesIntakeId") REFERENCES "SalesIntake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCustomFieldValue" ADD CONSTRAINT "SalesCustomFieldValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "SalesCustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
