-- Quote Signature System (Standard Acceptance foundation)

-- CreateEnum
CREATE TYPE "QuoteSignatureMode" AS ENUM ('STANDARD_ACCEPTANCE', 'VERIFIED_ESIGN');
CREATE TYPE "SignatureProvider" AS ENUM ('STRUXIENT', 'DOCUSIGN', 'ADOBE_SIGN', 'DROPBOX_SIGN');
CREATE TYPE "QuoteSignatureRequestStatus" AS ENUM ('DRAFT', 'READY_TO_SEND', 'SENT', 'PARTIALLY_VIEWED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED', 'DELIVERY_FAILED', 'FAILED');
CREATE TYPE "QuoteSignatureRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED', 'FAILED');
CREATE TYPE "SignatureDeliveryChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "QuoteSignatureEventType" AS ENUM (
  'SIGNATURE_REQUEST_CREATED', 'SIGNATURE_REQUEST_SENT', 'SIGNATURE_REQUEST_FAILED', 'SIGNATURE_REQUEST_RESENT', 'SIGNATURE_REQUEST_REVOKED',
  'QUOTE_SENT_EMAIL', 'QUOTE_SENT_SMS', 'EMAIL_QUEUED', 'EMAIL_SENT', 'EMAIL_DELIVERED', 'EMAIL_BOUNCED', 'EMAIL_FAILED', 'EMAIL_OPENED', 'EMAIL_CLICKED',
  'SMS_QUEUED', 'SMS_SENT', 'SMS_DELIVERED', 'SMS_FAILED', 'SMS_OPTED_OUT',
  'SIGNER_LINK_COPIED', 'SIGNER_LINK_MANUALLY_DELIVERED', 'SIGNER_LINK_OPENED', 'QUOTE_VIEWED', 'PDF_DOWNLOADED', 'CHANGE_REQUESTED',
  'CONSENT_CHECKED', 'TYPED_NAME_SUBMITTED', 'QUOTE_ACCEPTED', 'QUOTE_DECLINED', 'TOKEN_EXPIRED', 'TOKEN_REVOKED', 'FINAL_PDF_GENERATED',
  'PROVIDER_ENVELOPE_CREATED', 'PROVIDER_ENVELOPE_SENT', 'PROVIDER_ENVELOPE_COMPLETED', 'PROVIDER_ENVELOPE_DECLINED', 'PROVIDER_ENVELOPE_VOIDED', 'PROVIDER_WEBHOOK_RECEIVED'
);
CREATE TYPE "QuoteSignatureArtifactKind" AS ENUM ('SENT_PDF', 'FINAL_SIGNED_PDF', 'AUDIT_CERTIFICATE', 'FINAL_AUDIT_PACKET', 'PROVIDER_CERTIFICATE');
CREATE TYPE "SignatureActorType" AS ENUM ('STAFF', 'CUSTOMER_SIGNER', 'SYSTEM', 'PROVIDER');

-- CreateTable
CREATE TABLE "QuoteSignatureRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "mode" "QuoteSignatureMode" NOT NULL,
    "provider" "SignatureProvider" NOT NULL DEFAULT 'STRUXIENT',
    "status" "QuoteSignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedByUserId" TEXT,
    "customMessage" TEXT,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "frozenSnapshotJson" JSONB NOT NULL,
    "frozenSnapshotSha256" TEXT NOT NULL,
    "sentPdfArtifactId" TEXT,
    "sentPdfSha256" TEXT,
    "finalPdfArtifactId" TEXT,
    "finalPdfSha256" TEXT,
    "auditPacketArtifactId" TEXT,
    "auditPacketSha256" TEXT,
    "sendCheckpointId" TEXT,
    "approvalCheckpointId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteSignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteSignatureRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "QuoteSignatureRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "preferredDeliveryChannel" "SignatureDeliveryChannel",
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "tokenRevokedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "acceptedByName" TEXT,
    "acceptedConsentAt" TIMESTAMP(3),
    "consentText" TEXT,
    "consentVersion" TEXT,
    "acceptedFromIp" TEXT,
    "acceptedUserAgent" TEXT,
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteSignatureRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteSignatureEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "signatureRequestId" TEXT,
    "recipientId" TEXT,
    "actorType" "SignatureActorType" NOT NULL,
    "actorUserId" TEXT,
    "eventType" "QuoteSignatureEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "provider" "SignatureProvider",
    "providerEventId" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteSignatureEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteSignatureDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" "SignatureDeliveryChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "destinationMasked" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "QuoteSignatureDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteSignatureArtifact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "recipientId" TEXT,
    "attachmentId" TEXT NOT NULL,
    "kind" "QuoteSignatureArtifactKind" NOT NULL,
    "sha256" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,

    CONSTRAINT "QuoteSignatureArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteSignatureProviderEnvelope" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "provider" "SignatureProvider" NOT NULL,
    "providerEnvelopeId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "providerUrl" TEXT,
    "lastWebhookAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteSignatureProviderEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuoteSignatureRecipient_tokenHash_key" ON "QuoteSignatureRecipient"("tokenHash");
CREATE UNIQUE INDEX "QuoteSignatureProviderEnvelope_signatureRequestId_key" ON "QuoteSignatureProviderEnvelope"("signatureRequestId");
CREATE UNIQUE INDEX "QuoteSignatureEvent_provider_providerEventId_key" ON "QuoteSignatureEvent"("provider", "providerEventId");

CREATE INDEX "QuoteSignatureRequest_organizationId_idx" ON "QuoteSignatureRequest"("organizationId");
CREATE INDEX "QuoteSignatureRequest_quoteId_idx" ON "QuoteSignatureRequest"("quoteId");
CREATE INDEX "QuoteSignatureRequest_status_idx" ON "QuoteSignatureRequest"("status");
CREATE INDEX "QuoteSignatureRequest_quoteId_status_idx" ON "QuoteSignatureRequest"("quoteId", "status");

CREATE INDEX "QuoteSignatureRecipient_organizationId_idx" ON "QuoteSignatureRecipient"("organizationId");
CREATE INDEX "QuoteSignatureRecipient_signatureRequestId_idx" ON "QuoteSignatureRecipient"("signatureRequestId");
CREATE INDEX "QuoteSignatureRecipient_quoteId_idx" ON "QuoteSignatureRecipient"("quoteId");
CREATE INDEX "QuoteSignatureRecipient_tokenHash_idx" ON "QuoteSignatureRecipient"("tokenHash");

CREATE INDEX "QuoteSignatureEvent_organizationId_idx" ON "QuoteSignatureEvent"("organizationId");
CREATE INDEX "QuoteSignatureEvent_quoteId_occurredAt_idx" ON "QuoteSignatureEvent"("quoteId", "occurredAt");
CREATE INDEX "QuoteSignatureEvent_signatureRequestId_occurredAt_idx" ON "QuoteSignatureEvent"("signatureRequestId", "occurredAt");
CREATE INDEX "QuoteSignatureEvent_recipientId_occurredAt_idx" ON "QuoteSignatureEvent"("recipientId", "occurredAt");

CREATE INDEX "QuoteSignatureDelivery_organizationId_idx" ON "QuoteSignatureDelivery"("organizationId");
CREATE INDEX "QuoteSignatureDelivery_signatureRequestId_idx" ON "QuoteSignatureDelivery"("signatureRequestId");
CREATE INDEX "QuoteSignatureDelivery_recipientId_idx" ON "QuoteSignatureDelivery"("recipientId");
CREATE INDEX "QuoteSignatureDelivery_providerMessageId_idx" ON "QuoteSignatureDelivery"("providerMessageId");

CREATE INDEX "QuoteSignatureArtifact_organizationId_idx" ON "QuoteSignatureArtifact"("organizationId");
CREATE INDEX "QuoteSignatureArtifact_quoteId_idx" ON "QuoteSignatureArtifact"("quoteId");
CREATE INDEX "QuoteSignatureArtifact_signatureRequestId_idx" ON "QuoteSignatureArtifact"("signatureRequestId");
CREATE INDEX "QuoteSignatureArtifact_attachmentId_idx" ON "QuoteSignatureArtifact"("attachmentId");

CREATE INDEX "QuoteSignatureProviderEnvelope_organizationId_idx" ON "QuoteSignatureProviderEnvelope"("organizationId");
CREATE INDEX "QuoteSignatureProviderEnvelope_provider_providerEnvelopeId_idx" ON "QuoteSignatureProviderEnvelope"("provider", "providerEnvelopeId");

-- AddForeignKey
ALTER TABLE "QuoteSignatureRequest" ADD CONSTRAINT "QuoteSignatureRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureRequest" ADD CONSTRAINT "QuoteSignatureRequest_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteSignatureRecipient" ADD CONSTRAINT "QuoteSignatureRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureRecipient" ADD CONSTRAINT "QuoteSignatureRecipient_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "QuoteSignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteSignatureEvent" ADD CONSTRAINT "QuoteSignatureEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureEvent" ADD CONSTRAINT "QuoteSignatureEvent_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "QuoteSignatureRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureEvent" ADD CONSTRAINT "QuoteSignatureEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "QuoteSignatureRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteSignatureDelivery" ADD CONSTRAINT "QuoteSignatureDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureDelivery" ADD CONSTRAINT "QuoteSignatureDelivery_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "QuoteSignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureDelivery" ADD CONSTRAINT "QuoteSignatureDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "QuoteSignatureRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteSignatureArtifact" ADD CONSTRAINT "QuoteSignatureArtifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureArtifact" ADD CONSTRAINT "QuoteSignatureArtifact_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "QuoteSignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureArtifact" ADD CONSTRAINT "QuoteSignatureArtifact_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "QuoteSignatureRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteSignatureProviderEnvelope" ADD CONSTRAINT "QuoteSignatureProviderEnvelope_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteSignatureProviderEnvelope" ADD CONSTRAINT "QuoteSignatureProviderEnvelope_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "QuoteSignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
