-- CreateEnum
CREATE TYPE "OrganizationSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID', 'PAUSED');

-- CreateEnum
CREATE TYPE "AiBillingPeriodInvoiceStatus" AS ENUM ('OPEN', 'NO_OVERAGE', 'INVOICE_ITEM_CREATED', 'INVOICED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiUsageBillableStatus" AS ENUM ('INCLUDED', 'OVERAGE', 'UNBILLABLE', 'ERROR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "OrganizationBillingAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "billingEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "status" "OrganizationSubscriptionStatus" NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBillingPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "includedAllowanceUnits" INTEGER NOT NULL,
    "usedUnits" INTEGER NOT NULL DEFAULT 0,
    "overageUnits" INTEGER NOT NULL DEFAULT 0,
    "overageAmountCents" INTEGER NOT NULL DEFAULT 0,
    "invoiceStatus" "AiBillingPeriodInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "stripeInvoiceItemId" TEXT,
    "stripeInvoiceId" TEXT,
    "invoiceError" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBillingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadHash" TEXT,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AiUsageLog" ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER,
ADD COLUMN "estimatedCostCents" INTEGER,
ADD COLUMN "billableUnits" INTEGER,
ADD COLUMN "billableStatus" "AiUsageBillableStatus",
ADD COLUMN "aiBillingPeriodId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBillingAccount_organizationId_key" ON "OrganizationBillingAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBillingAccount_stripeCustomerId_key" ON "OrganizationBillingAccount"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "OrganizationBillingAccount_stripeCustomerId_idx" ON "OrganizationBillingAccount"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSubscription_stripeSubscriptionId_key" ON "OrganizationSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_stripeSubscriptionId_idx" ON "OrganizationSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_status_idx" ON "OrganizationSubscription"("status");

-- CreateIndex
CREATE INDEX "AiBillingPeriod_organizationId_periodEnd_idx" ON "AiBillingPeriod"("organizationId", "periodEnd");

-- CreateIndex
CREATE INDEX "AiBillingPeriod_invoiceStatus_periodEnd_idx" ON "AiBillingPeriod"("invoiceStatus", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AiBillingPeriod_organizationId_periodStart_key" ON "AiBillingPeriod"("organizationId", "periodStart");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_processedAt_idx" ON "StripeWebhookEvent"("type", "processedAt");

-- CreateIndex
CREATE INDEX "AiUsageLog_aiBillingPeriodId_idx" ON "AiUsageLog"("aiBillingPeriodId");

-- AddForeignKey
ALTER TABLE "OrganizationBillingAccount" ADD CONSTRAINT "OrganizationBillingAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBillingPeriod" ADD CONSTRAINT "AiBillingPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_aiBillingPeriodId_fkey" FOREIGN KEY ("aiBillingPeriodId") REFERENCES "AiBillingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
