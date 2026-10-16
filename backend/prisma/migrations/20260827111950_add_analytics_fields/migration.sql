-- AlterTable
ALTER TABLE "call_analyses" ADD COLUMN     "customerQuestions" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "transferredToHuman" BOOLEAN NOT NULL DEFAULT false;
