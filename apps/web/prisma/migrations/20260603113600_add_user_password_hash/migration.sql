-- Add password hash storage for first-party credentials login.
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT;
