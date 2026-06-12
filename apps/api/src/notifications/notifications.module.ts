import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationsProcessor, NOTIFICATION_QUEUE } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }),
  ],
  providers: [NotificationsService, NotificationsProcessor, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
