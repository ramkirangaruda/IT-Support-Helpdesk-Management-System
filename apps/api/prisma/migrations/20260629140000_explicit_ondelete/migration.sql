-- Make onDelete behaviour explicit across all relations (FIX 4). Only two relations
-- actually change at the DB level — Notification.ticket and ChatSession.ticket move from
-- SET NULL to CASCADE so a (hypothetical) ticket delete removes its notifications and chat
-- session. All other relations already matched the chosen Restrict/SetNull defaults.

-- DropForeignKey
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_ticketId_fkey";

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
