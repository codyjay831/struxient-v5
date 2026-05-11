-- CreateEnum
CREATE TYPE "NeededByBucket" AS ENUM ('ASAP', 'THIS_WEEK', 'THIS_MONTH', 'FLEXIBLE', 'SPECIFIC_DATE');

-- CreateEnum
CREATE TYPE "QuoteCheckpointSource" AS ENUM ('STAFF', 'CUSTOMER_PORTAL');

-- CreateEnum
CREATE TYPE "LeadVisitRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LeadCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'SELECT');

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "neededByBucket" "NeededByBucket",
ADD COLUMN     "neededByDate" TIMESTAMP(3),
ADD COLUMN     "requestType" TEXT,
ADD COLUMN     "scopeSummary" TEXT,
ADD COLUMN     "suggestedTemplateIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PublicRequestSettings" ADD COLUMN     "instantQuoteConfigJson" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "lastSentEmailAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "QuoteCheckpoint" ADD COLUMN     "source" "QuoteCheckpointSource" NOT NULL DEFAULT 'STAFF';

-- CreateTable
CREATE TABLE "QuoteShareToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedByName" TEXT,
    "acceptedFromIp" TEXT,

    CONSTRAINT "QuoteShareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadVisitRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3),
    "requestedWindow" TEXT,
    "confirmedDate" TIMESTAMP(3),
    "status" "LeadVisitRequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadVisitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCustomFieldDef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "LeadCustomFieldType" NOT NULL,
    "optionsJson" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "showOnPublicIntake" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCustomFieldDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCustomFieldValue" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fieldDefId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteShareToken_quoteId_key" ON "QuoteShareToken"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteShareToken_token_key" ON "QuoteShareToken"("token");

-- CreateIndex
CREATE INDEX "QuoteShareToken_organizationId_idx" ON "QuoteShareToken"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteShareToken_token_idx" ON "QuoteShareToken"("token");

-- CreateIndex
CREATE INDEX "LeadVisitRequest_organizationId_idx" ON "LeadVisitRequest"("organizationId");

-- CreateIndex
CREATE INDEX "LeadVisitRequest_leadId_idx" ON "LeadVisitRequest"("leadId");

-- CreateIndex
CREATE INDEX "LeadVisitRequest_status_idx" ON "LeadVisitRequest"("status");

-- CreateIndex
CREATE INDEX "LeadCustomFieldDef_organizationId_idx" ON "LeadCustomFieldDef"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCustomFieldDef_organizationId_key_key" ON "LeadCustomFieldDef"("organizationId", "key");

-- CreateIndex
CREATE INDEX "LeadCustomFieldValue_leadId_idx" ON "LeadCustomFieldValue"("leadId");

-- CreateIndex
CREATE INDEX "LeadCustomFieldValue_fieldDefId_idx" ON "LeadCustomFieldValue"("fieldDefId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCustomFieldValue_leadId_fieldDefId_key" ON "LeadCustomFieldValue"("leadId", "fieldDefId");

-- CreateIndex
CREATE INDEX "Attachment_customerId_idx" ON "Attachment"("customerId");

-- AddForeignKey
ALTER TABLE "QuoteShareToken" ADD CONSTRAINT "QuoteShareToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteShareToken" ADD CONSTRAINT "QuoteShareToken_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVisitRequest" ADD CONSTRAINT "LeadVisitRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadVisitRequest" ADD CONSTRAINT "LeadVisitRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCustomFieldDef" ADD CONSTRAINT "LeadCustomFieldDef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCustomFieldValue" ADD CONSTRAINT "LeadCustomFieldValue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCustomFieldValue" ADD CONSTRAINT "LeadCustomFieldValue_fieldDefId_fkey" FOREIGN KEY ("fieldDefId") REFERENCES "LeadCustomFieldDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
