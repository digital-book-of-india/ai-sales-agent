-- CreateEnum
CREATE TYPE "RecordingRetentionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DELETED');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN "recordingConsent" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "recordingUrl" TEXT NOT NULL,
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "storageProvider" TEXT NOT NULL,
    "retentionStatus" "RecordingRetentionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recordings_callId_key" ON "recordings"("callId");

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
