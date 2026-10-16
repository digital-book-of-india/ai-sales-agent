-- CreateEnum
CREATE TYPE "CallingQueueStatus" AS ENUM ('PENDING', 'QUEUED', 'DIALING', 'RINGING', 'CONNECTED', 'COMPLETED', 'FAILED', 'NO_ANSWER', 'BUSY', 'RETRY', 'SKIPPED', 'CANCELLED');

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "callsPerMinute" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "calling_queue" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "CallingQueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "callId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calling_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calling_queue_status_idx" ON "calling_queue"("status");

-- CreateIndex
CREATE INDEX "calling_queue_campaignId_status_idx" ON "calling_queue"("campaignId", "status");

-- CreateIndex
CREATE INDEX "calling_queue_leadId_idx" ON "calling_queue"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "calling_queue_campaignId_leadId_key" ON "calling_queue"("campaignId", "leadId");

-- AddForeignKey
ALTER TABLE "calling_queue" ADD CONSTRAINT "calling_queue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calling_queue" ADD CONSTRAINT "calling_queue_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
