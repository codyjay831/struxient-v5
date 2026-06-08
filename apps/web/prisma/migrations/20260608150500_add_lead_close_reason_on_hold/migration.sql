-- Add contractor-grade close-out facts to leads.
CREATE TYPE "LeadCloseReason" AS ENUM (
  'CHOSE_ANOTHER',
  'BUDGET_OR_TIMING',
  'NO_RESPONSE',
  'NOT_OUR_TRADE',
  'OTHER'
);

ALTER TYPE "LeadStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';

ALTER TABLE "Lead"
ADD COLUMN "closeReason" "LeadCloseReason",
ADD COLUMN "followUpAt" TIMESTAMP(3),
ADD COLUMN "closedAt" TIMESTAMP(3);
