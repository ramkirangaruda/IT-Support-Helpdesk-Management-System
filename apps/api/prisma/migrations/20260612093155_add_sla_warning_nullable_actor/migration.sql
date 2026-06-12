-- DropForeignKey
ALTER TABLE "StatusHistory" DROP CONSTRAINT "StatusHistory_actorId_fkey";

-- AlterTable
ALTER TABLE "StatusHistory" ALTER COLUMN "actorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "sla75WarningSent" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
