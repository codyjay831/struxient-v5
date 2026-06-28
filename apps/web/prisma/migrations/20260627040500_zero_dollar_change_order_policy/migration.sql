-- CreateEnum
CREATE TYPE "ZeroDollarPolicyClass" AS ENUM ('INTERNAL_ADMIN', 'INTERNAL_EXECUTION_ONLY', 'CUSTOMER_FACING_CHANGE');

-- AlterTable
ALTER TABLE "ChangeOrder"
ADD COLUMN "zeroDollarPolicyClass" "ZeroDollarPolicyClass",
ADD COLUMN "internalNoCustomerImpactConfirmedAt" TIMESTAMP(3),
ADD COLUMN "internalNoCustomerImpactConfirmedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "ChangeOrder"
ADD CONSTRAINT "ChangeOrder_internalNoCustomerImpactConfirmedByUserId_fkey"
FOREIGN KEY ("internalNoCustomerImpactConfirmedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ChangeOrder_zeroDollarPolicyClass_idx" ON "ChangeOrder"("zeroDollarPolicyClass");

-- CreateIndex
CREATE INDEX "ChangeOrder_internalNoCustomerImpactConfirmedByUserId_idx" ON "ChangeOrder"("internalNoCustomerImpactConfirmedByUserId");
