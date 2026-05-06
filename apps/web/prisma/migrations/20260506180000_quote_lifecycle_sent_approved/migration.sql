-- AlterEnum: extend QuoteStatus (PostgreSQL appends new labels)
ALTER TYPE "QuoteStatus" ADD VALUE 'SENT';
ALTER TYPE "QuoteStatus" ADD VALUE 'APPROVED';

-- AlterEnum: extend QuoteCheckpointKind
ALTER TYPE "QuoteCheckpointKind" ADD VALUE 'APPROVAL';
