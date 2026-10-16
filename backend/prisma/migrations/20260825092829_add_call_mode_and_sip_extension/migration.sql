-- CreateEnum
CREATE TYPE "CallMode" AS ENUM ('AI', 'MANUAL');

-- AlterTable
ALTER TABLE "calls" ADD COLUMN     "callMode" "CallMode" NOT NULL DEFAULT 'AI',
ADD COLUMN     "salesUserId" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sipExtension" TEXT;

-- CreateIndex
CREATE INDEX "calls_salesUserId_idx" ON "calls"("salesUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_sipExtension_key" ON "users"("sipExtension");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
