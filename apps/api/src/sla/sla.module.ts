import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TicketsModule } from '../tickets/tickets.module';
import { SLA_QUEUE_NAME } from './sla.constants';
import { SlaProcessor } from './sla.processor';
import { SlaScheduler } from './sla.scheduler';

@Module({
  imports: [
    BullModule.registerQueue({ name: SLA_QUEUE_NAME }),
    NotificationsModule,
    TicketsModule,
  ],
  providers: [SlaProcessor, SlaScheduler],
})
export class SlaModule {}
