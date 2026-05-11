-- CreateTable
CREATE TABLE "QuoteView" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "QuoteView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteView_organizationId_idx" ON "QuoteView"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteView_quoteId_idx" ON "QuoteView"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteView_token_idx" ON "QuoteView"("token");
