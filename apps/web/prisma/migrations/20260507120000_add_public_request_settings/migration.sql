-- CreateTable
CREATE TABLE "PublicRequestSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "formTitle" TEXT NOT NULL DEFAULT 'Request service',
    "introMessage" TEXT,
    "emergencyWarningText" TEXT,
    "submitButtonText" TEXT NOT NULL DEFAULT 'Send request',
    "requestTypeOptionsJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicRequestSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicRequestSettings_organizationId_key" ON "PublicRequestSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "PublicRequestSettings" ADD CONSTRAINT "PublicRequestSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
