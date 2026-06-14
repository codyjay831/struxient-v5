-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('OPERATOR');

-- CreateEnum
CREATE TYPE "PlatformAuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PlatformAuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'ERROR');

-- CreateTable
CREATE TABLE "PlatformAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "PlatformAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "PlatformAuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorEmailSnapshot" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "organizationId" TEXT,
    "reason" TEXT,
    "outcome" "PlatformAuditOutcome" NOT NULL,
    "requestId" TEXT,
    "metadataJson" JSONB,

    CONSTRAINT "PlatformAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccess_userId_key" ON "PlatformAccess"("userId");

-- CreateIndex
CREATE INDEX "PlatformAccess_revokedAt_idx" ON "PlatformAccess"("revokedAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_createdAt_idx" ON "PlatformAuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_actorUserId_createdAt_idx" ON "PlatformAuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_organizationId_createdAt_idx" ON "PlatformAuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_action_createdAt_idx" ON "PlatformAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformAuditEvent_outcome_createdAt_idx" ON "PlatformAuditEvent"("outcome", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformAccess" ADD CONSTRAINT "PlatformAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccess" ADD CONSTRAINT "PlatformAccess_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccess" ADD CONSTRAINT "PlatformAccess_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAuditEvent" ADD CONSTRAINT "PlatformAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAuditEvent" ADD CONSTRAINT "PlatformAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
