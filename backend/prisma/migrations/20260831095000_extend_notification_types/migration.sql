-- AlterEnum
-- Prompt 19 — Notifications: new NotificationType producers (see schema.prisma
-- for which service writes each one). HUMAN_TRANSFER already exists from
-- Prompt 18 and isn't touched here.
ALTER TYPE "NotificationType" ADD VALUE 'HOT_LEAD';
ALTER TYPE "NotificationType" ADD VALUE 'HIGH_VALUE_LEAD';
ALTER TYPE "NotificationType" ADD VALUE 'FOLLOW_UP_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'CAMPAIGN_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'CALL_FAILURES_THRESHOLD';
ALTER TYPE "NotificationType" ADD VALUE 'AI_ERROR';
ALTER TYPE "NotificationType" ADD VALUE 'DEAL_WON';
