/*
  Warnings:

  - You are about to drop the column `color` on the `Memory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "llmParams" JSONB;

-- AlterTable
ALTER TABLE "Memory" DROP COLUMN "color";

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "color" TEXT;
