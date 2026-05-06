-- AlterTable
ALTER TABLE "LineItemTemplate" ADD COLUMN     "defaultCustomerExcludedNotes" TEXT,
ADD COLUMN     "defaultCustomerIncludedNotes" TEXT,
ADD COLUMN     "defaultCustomerPresentationGroup" TEXT,
ADD COLUMN     "defaultCustomerScopeDescription" TEXT,
ADD COLUMN     "defaultCustomerScopeTitle" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "customerDocumentTitle" TEXT;

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN     "customerExcludedNotes" TEXT,
ADD COLUMN     "customerIncludedNotes" TEXT,
ADD COLUMN     "customerPresentationGroup" TEXT,
ADD COLUMN     "customerScopeDescription" TEXT,
ADD COLUMN     "customerScopeTitle" TEXT;
