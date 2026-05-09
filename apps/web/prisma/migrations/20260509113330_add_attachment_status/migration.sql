-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- DropForeignKey
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_jobId_fkey";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "status" "AttachmentStatus" NOT NULL DEFAULT 'READY';

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
