import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketStateMachineService } from './ticket-state-machine.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketStateMachineService],
  exports: [TicketsService, TicketStateMachineService],
})
export class TicketsModule {}
