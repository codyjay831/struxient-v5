-- AlterTable
ALTER TABLE "LineItemTemplate" ADD COLUMN     "priceBufferPercentage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "PublicRequestSettings" ADD COLUMN     "instantQuoteEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "offerings" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "showInstantQuoteDetails" BOOLEAN NOT NULL DEFAULT true;
