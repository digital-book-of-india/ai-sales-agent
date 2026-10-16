-- CreateEnum
CREATE TYPE "DecisionMaker" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CallIntent" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "CallSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "LeadScoreCategory" AS ENUM ('HOT', 'WARM', 'COLD', 'LOW');

-- CreateTable
CREATE TABLE "call_analyses" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "summary" TEXT,
    "requirement" TEXT,
    "budget" TEXT,
    "timeline" TEXT,
    "decisionMaker" "DecisionMaker" NOT NULL DEFAULT 'UNKNOWN',
    "intent" "CallIntent" NOT NULL DEFAULT 'NONE',
    "sentiment" "CallSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "demoRequested" BOOLEAN NOT NULL DEFAULT false,
    "objections" JSONB NOT NULL DEFAULT '[]',
    "nextAction" TEXT,
    "qualityScore" JSONB NOT NULL DEFAULT '{}',
    "coachingFeedback" TEXT,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "leadScoreCategory" "LeadScoreCategory" NOT NULL DEFAULT 'LOW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "callId" UUID,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "call_analyses_callId_key" ON "call_analyses"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "activities_leadId_createdAt_idx" ON "activities"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "activities_callId_idx" ON "activities"("callId");

-- AddForeignKey
ALTER TABLE "call_analyses" ADD CONSTRAINT "call_analyses_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_callId_fkey" FOREIGN KEY ("callId") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
