-- CreateEnum
CREATE TYPE "BetaSignupInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "BetaSignupInvite" (
    "id" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "BetaSignupInviteStatus" NOT NULL DEFAULT 'PENDING',
    "betaDays" INTEGER NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiIncludedUnits" INTEGER NOT NULL DEFAULT 50,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "organizationId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaSignupInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationBetaGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "betaSignupInviteId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiIncludedUnits" INTEGER NOT NULL DEFAULT 50,
    "usedAiUnits" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationBetaGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BetaSignupInvite_tokenHash_key" ON "BetaSignupInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "BetaSignupInvite_organizationId_key" ON "BetaSignupInvite"("organizationId");

-- CreateIndex
CREATE INDEX "BetaSignupInvite_normalizedEmail_status_idx" ON "BetaSignupInvite"("normalizedEmail", "status");

-- CreateIndex
CREATE INDEX "BetaSignupInvite_expiresAt_idx" ON "BetaSignupInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "BetaSignupInvite_status_idx" ON "BetaSignupInvite"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBetaGrant_organizationId_key" ON "OrganizationBetaGrant"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationBetaGrant_betaSignupInviteId_key" ON "OrganizationBetaGrant"("betaSignupInviteId");

-- CreateIndex
CREATE INDEX "OrganizationBetaGrant_expiresAt_idx" ON "OrganizationBetaGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "OrganizationBetaGrant_revokedAt_idx" ON "OrganizationBetaGrant"("revokedAt");

-- AddForeignKey
ALTER TABLE "BetaSignupInvite" ADD CONSTRAINT "BetaSignupInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaSignupInvite" ADD CONSTRAINT "BetaSignupInvite_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaSignupInvite" ADD CONSTRAINT "BetaSignupInvite_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetaSignupInvite" ADD CONSTRAINT "BetaSignupInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationBetaGrant" ADD CONSTRAINT "OrganizationBetaGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationBetaGrant" ADD CONSTRAINT "OrganizationBetaGrant_betaSignupInviteId_fkey" FOREIGN KEY ("betaSignupInviteId") REFERENCES "BetaSignupInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationBetaGrant" ADD CONSTRAINT "OrganizationBetaGrant_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationBetaGrant" ADD CONSTRAINT "OrganizationBetaGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
