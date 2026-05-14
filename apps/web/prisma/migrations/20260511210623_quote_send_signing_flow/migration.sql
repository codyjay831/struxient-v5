-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "QuoteShareToken" ADD COLUMN     "userAgent" TEXT;

-- CreateTable
CREATE TABLE "QuoteChangeRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "submittedFromIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "QuoteChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteChangeRequest_quoteId_idx" ON "QuoteChangeRequest"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteChangeRequest_organizationId_createdAt_idx" ON "QuoteChangeRequest"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuoteChangeRequest" ADD CONSTRAINT "QuoteChangeRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteChangeRequest" ADD CONSTRAINT "QuoteChangeRequest_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteChangeRequest" ADD CONSTRAINT "QuoteChangeRequest_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
