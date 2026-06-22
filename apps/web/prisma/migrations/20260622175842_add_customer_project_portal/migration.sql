-- CreateEnum
CREATE TYPE "CustomerPortalAccessLevel" AS ENUM ('VIEW_ONLY', 'PROJECT_PARTICIPANT', 'BILLING_CONTACT', 'DECISION_MAKER', 'PROPERTY_MANAGER');

-- CreateEnum
CREATE TYPE "CustomerPortalAccessStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFICATION', 'REVOKED', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CustomerPortalMagicLinkPurpose" AS ENUM ('PORTAL_SIGN_IN', 'QUOTE_VIEW', 'CHANGE_ORDER_VIEW', 'PAYMENT_VIEW', 'DOCUMENT_UPLOAD');

-- CreateEnum
CREATE TYPE "CustomerPortalEventType" AS ENUM ('PORTAL_OPENED', 'MAGIC_LINK_SENT', 'MAGIC_LINK_USED', 'QUOTE_VIEWED', 'QUOTE_ACCEPTED', 'QUOTE_CHANGE_REQUESTED', 'CHANGE_ORDER_VIEWED', 'CHANGE_ORDER_ACCEPTED', 'PAYMENT_LINK_OPENED', 'DOCUMENT_VIEWED', 'DOCUMENT_UPLOADED', 'PHOTO_UPLOADED', 'APPOINTMENT_VIEWED', 'APPOINTMENT_CONFIRMED', 'RESCHEDULE_REQUESTED', 'AVAILABILITY_SUBMITTED', 'ACCESS_NOTE_SUBMITTED', 'QUESTION_SUBMITTED', 'CONTRACTOR_RESPONSE_VIEWED', 'ACCESS_REVOKED', 'ACCESS_EXPIRED');

-- CreateEnum
CREATE TYPE "CustomerVisibleResourceType" AS ENUM ('QUOTE', 'CHANGE_ORDER', 'INVOICE', 'PAYMENT_LINK', 'DOCUMENT', 'PHOTO', 'SCHEDULE_EVENT', 'PROJECT_UPDATE', 'CUSTOMER_REQUEST', 'CUSTOMER_UPLOAD');

-- CreateEnum
CREATE TYPE "CustomerVisibleResourceVisibility" AS ENUM ('CUSTOMER_VISIBLE', 'CUSTOMER_ACTION_REQUIRED', 'CUSTOMER_UPLOADED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CustomerRequestType" AS ENUM ('ASK_QUESTION', 'REQUEST_RESCHEDULE', 'SUBMIT_AVAILABILITY', 'UPLOAD_DOCUMENT', 'UPLOAD_PHOTO', 'ADD_ACCESS_NOTE', 'REPORT_ISSUE', 'REQUEST_SCOPE_CHANGE', 'BILLING_QUESTION');

-- CreateEnum
CREATE TYPE "CustomerRequestStatus" AS ENUM ('OPEN', 'NEEDS_REVIEW', 'ACCEPTED', 'DECLINED', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "relationshipToProperty" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isBillingContact" BOOLEAN NOT NULL DEFAULT false,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalIdentity" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "phoneNormalized" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPortalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerContactId" TEXT,
    "portalIdentityId" TEXT,
    "accessLevel" "CustomerPortalAccessLevel" NOT NULL DEFAULT 'PROJECT_PARTICIPANT',
    "status" "CustomerPortalAccessStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "invitedByMembershipId" TEXT,
    "revokedByMembershipId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPortalAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalSession" (
    "id" TEXT NOT NULL,
    "portalIdentityId" TEXT NOT NULL,
    "customerPortalAccessId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "CustomerPortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalMagicLinkToken" (
    "id" TEXT NOT NULL,
    "portalIdentityId" TEXT,
    "customerPortalAccessId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "CustomerPortalMagicLinkPurpose" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "CustomerPortalMagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPortalEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "customerPortalAccessId" TEXT,
    "portalIdentityId" TEXT,
    "eventType" "CustomerPortalEventType" NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadataJson" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPortalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerVisibleResource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "resourceType" "CustomerVisibleResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "visibility" "CustomerVisibleResourceVisibility" NOT NULL DEFAULT 'CUSTOMER_VISIBLE',
    "visibleToAccessLevel" "CustomerPortalAccessLevel",
    "title" TEXT,
    "description" TEXT,
    "createdByMembershipId" TEXT,
    "customerPortalAccessId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerVisibleResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerPortalAccessId" TEXT,
    "type" "CustomerRequestType" NOT NULL,
    "status" "CustomerRequestStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByMembershipId" TEXT,
    "linkedTaskId" TEXT,
    "linkedScheduleEventId" TEXT,
    "linkedDocumentId" TEXT,

    CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerContact_organizationId_idx" ON "CustomerContact"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerContact_customerId_idx" ON "CustomerContact"("customerId");

-- CreateIndex
CREATE INDEX "CustomerContact_organizationId_email_idx" ON "CustomerContact"("organizationId", "email");

-- CreateIndex
CREATE INDEX "CustomerContact_organizationId_phone_idx" ON "CustomerContact"("organizationId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalIdentity_emailNormalized_key" ON "CustomerPortalIdentity"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalIdentity_phoneNormalized_key" ON "CustomerPortalIdentity"("phoneNormalized");

-- CreateIndex
CREATE INDEX "CustomerPortalIdentity_disabledAt_idx" ON "CustomerPortalIdentity"("disabledAt");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_organizationId_customerId_idx" ON "CustomerPortalAccess"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_organizationId_jobId_idx" ON "CustomerPortalAccess"("organizationId", "jobId");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_customerContactId_idx" ON "CustomerPortalAccess"("customerContactId");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_portalIdentityId_idx" ON "CustomerPortalAccess"("portalIdentityId");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_status_idx" ON "CustomerPortalAccess"("status");

-- CreateIndex
CREATE INDEX "CustomerPortalAccess_expiresAt_idx" ON "CustomerPortalAccess"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalSession_sessionTokenHash_key" ON "CustomerPortalSession"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "CustomerPortalSession_portalIdentityId_idx" ON "CustomerPortalSession"("portalIdentityId");

-- CreateIndex
CREATE INDEX "CustomerPortalSession_customerPortalAccessId_idx" ON "CustomerPortalSession"("customerPortalAccessId");

-- CreateIndex
CREATE INDEX "CustomerPortalSession_expiresAt_idx" ON "CustomerPortalSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPortalMagicLinkToken_tokenHash_key" ON "CustomerPortalMagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPortalMagicLinkToken_customerPortalAccessId_idx" ON "CustomerPortalMagicLinkToken"("customerPortalAccessId");

-- CreateIndex
CREATE INDEX "CustomerPortalMagicLinkToken_expiresAt_idx" ON "CustomerPortalMagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerPortalMagicLinkToken_purpose_idx" ON "CustomerPortalMagicLinkToken"("purpose");

-- CreateIndex
CREATE INDEX "CustomerPortalEvent_organizationId_idx" ON "CustomerPortalEvent"("organizationId");

-- CreateIndex
CREATE INDEX "CustomerPortalEvent_customerId_idx" ON "CustomerPortalEvent"("customerId");

-- CreateIndex
CREATE INDEX "CustomerPortalEvent_jobId_idx" ON "CustomerPortalEvent"("jobId");

-- CreateIndex
CREATE INDEX "CustomerPortalEvent_customerPortalAccessId_idx" ON "CustomerPortalEvent"("customerPortalAccessId");

-- CreateIndex
CREATE INDEX "CustomerPortalEvent_eventType_idx" ON "CustomerPortalEvent"("eventType");

-- CreateIndex
CREATE INDEX "CustomerPortalEvent_createdAt_idx" ON "CustomerPortalEvent"("createdAt");

-- CreateIndex
CREATE INDEX "CustomerVisibleResource_organizationId_jobId_idx" ON "CustomerVisibleResource"("organizationId", "jobId");

-- CreateIndex
CREATE INDEX "CustomerVisibleResource_customerId_idx" ON "CustomerVisibleResource"("customerId");

-- CreateIndex
CREATE INDEX "CustomerVisibleResource_resourceType_resourceId_idx" ON "CustomerVisibleResource"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "CustomerVisibleResource_visibility_idx" ON "CustomerVisibleResource"("visibility");

-- CreateIndex
CREATE INDEX "CustomerRequest_organizationId_jobId_idx" ON "CustomerRequest"("organizationId", "jobId");

-- CreateIndex
CREATE INDEX "CustomerRequest_customerId_idx" ON "CustomerRequest"("customerId");

-- CreateIndex
CREATE INDEX "CustomerRequest_status_idx" ON "CustomerRequest"("status");

-- CreateIndex
CREATE INDEX "CustomerRequest_type_idx" ON "CustomerRequest"("type");

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_customerContactId_fkey" FOREIGN KEY ("customerContactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_portalIdentityId_fkey" FOREIGN KEY ("portalIdentityId") REFERENCES "CustomerPortalIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_invitedByMembershipId_fkey" FOREIGN KEY ("invitedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalAccess" ADD CONSTRAINT "CustomerPortalAccess_revokedByMembershipId_fkey" FOREIGN KEY ("revokedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_portalIdentityId_fkey" FOREIGN KEY ("portalIdentityId") REFERENCES "CustomerPortalIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_customerPortalAccessId_fkey" FOREIGN KEY ("customerPortalAccessId") REFERENCES "CustomerPortalAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalMagicLinkToken" ADD CONSTRAINT "CustomerPortalMagicLinkToken_portalIdentityId_fkey" FOREIGN KEY ("portalIdentityId") REFERENCES "CustomerPortalIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalMagicLinkToken" ADD CONSTRAINT "CustomerPortalMagicLinkToken_customerPortalAccessId_fkey" FOREIGN KEY ("customerPortalAccessId") REFERENCES "CustomerPortalAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalEvent" ADD CONSTRAINT "CustomerPortalEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalEvent" ADD CONSTRAINT "CustomerPortalEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalEvent" ADD CONSTRAINT "CustomerPortalEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalEvent" ADD CONSTRAINT "CustomerPortalEvent_customerPortalAccessId_fkey" FOREIGN KEY ("customerPortalAccessId") REFERENCES "CustomerPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPortalEvent" ADD CONSTRAINT "CustomerPortalEvent_portalIdentityId_fkey" FOREIGN KEY ("portalIdentityId") REFERENCES "CustomerPortalIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVisibleResource" ADD CONSTRAINT "CustomerVisibleResource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVisibleResource" ADD CONSTRAINT "CustomerVisibleResource_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVisibleResource" ADD CONSTRAINT "CustomerVisibleResource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVisibleResource" ADD CONSTRAINT "CustomerVisibleResource_customerPortalAccessId_fkey" FOREIGN KEY ("customerPortalAccessId") REFERENCES "CustomerPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerVisibleResource" ADD CONSTRAINT "CustomerVisibleResource_createdByMembershipId_fkey" FOREIGN KEY ("createdByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_customerPortalAccessId_fkey" FOREIGN KEY ("customerPortalAccessId") REFERENCES "CustomerPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_resolvedByMembershipId_fkey" FOREIGN KEY ("resolvedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_linkedTaskId_fkey" FOREIGN KEY ("linkedTaskId") REFERENCES "JobTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_linkedScheduleEventId_fkey" FOREIGN KEY ("linkedScheduleEventId") REFERENCES "JobScheduleEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_linkedDocumentId_fkey" FOREIGN KEY ("linkedDocumentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "QuoteScopeDecision_organizationId_quoteId_quoteLineItemId_sourc" RENAME TO "QuoteScopeDecision_organizationId_quoteId_quoteLineItemId_s_idx";
