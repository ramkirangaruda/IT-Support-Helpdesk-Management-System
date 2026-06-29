-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");
-- CreateIndex
CREATE INDEX "DeviceAllocation_employeeId_idx" ON "DeviceAllocation"("employeeId");
-- CreateIndex
CREATE INDEX "DeviceAllocation_deviceId_idx" ON "DeviceAllocation"("deviceId");
-- CreateIndex
CREATE INDEX "DeviceRequest_requesterId_idx" ON "DeviceRequest"("requesterId");
-- CreateIndex
CREATE INDEX "DeviceRequest_status_idx" ON "DeviceRequest"("status");
-- CreateIndex
CREATE INDEX "Notification_recipientEmail_status_idx" ON "Notification"("recipientEmail", "status");
-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");
-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
-- CreateIndex
CREATE INDEX "Ticket_assigneeId_idx" ON "Ticket"("assigneeId");
-- CreateIndex
CREATE INDEX "Ticket_requesterId_idx" ON "Ticket"("requesterId");
-- CreateIndex
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");
