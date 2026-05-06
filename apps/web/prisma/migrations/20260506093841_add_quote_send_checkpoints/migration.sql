-- CreateEnum
CREATE TYPE "QuoteCheckpointKind" AS ENUM ('SEND');

-- CreateTable
CREATE TABLE "QuoteCheckpoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" "QuoteCheckpointKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "staffOnlyJson" JSONB,
    "quoteUpdatedAtAtCapture" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteCheckpoint_organizationId_idx" ON "QuoteCheckpoint"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteCheckpoint_quoteId_kind_idx" ON "QuoteCheckpoint"("quoteId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteCheckpoint_quoteId_kind_sequence_key" ON "QuoteCheckpoint"("quoteId", "kind", "sequence");

-- AddForeignKey
ALTER TABLE "QuoteCheckpoint" ADD CONSTRAINT "QuoteCheckpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteCheckpoint" ADD CONSTRAINT "QuoteCheckpoint_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
