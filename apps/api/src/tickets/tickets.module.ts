import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketEventsListener } from './ticket-events.listener';
import { TicketStateMachineService } from './ticket-state-machine.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketStateMachineService, TicketEventsListener],
  exports: [TicketsService, TicketStateMachineService],
})
export class TicketsModule {}
